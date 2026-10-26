import { useEffect, useState } from 'react';
import { api } from '../../services/api';

/** Pre-fills the "Find new jobs" form (roles, location, experience years/months) and extracts resume skills from the candidate profile. */
export function useDiscoveryDefaults(
  setRoles: (v: string) => void,
  setLocation: (v: string) => void,
  setExpYears: (v: number) => void,
  setExpMonths?: (v: number) => void,
): { profileSkills: string[] } {
  const [profileSkills, setProfileSkills] = useState<string[]>([]);

  useEffect(() => {
    api
      .getProfile()
      .then((prof: any) => {
        if (!prof) return;
        if (prof.headline) setRoles(prof.headline);
        if (prof.location) setLocation(prof.location);
        if (prof.total_experience_months !== undefined && prof.total_experience_months !== null) {
          const total = Math.max(0, prof.total_experience_months);
          setExpYears(Math.floor(total / 12));
          if (setExpMonths) {
            setExpMonths(total % 12);
          }
        }
        if (Array.isArray(prof.skills) && prof.skills.length > 0) {
          const extracted = prof.skills
            .map((s: any) => (typeof s === 'string' ? s : s?.skill_name))
            .filter((s: any): s is string => typeof s === 'string' && s.trim().length > 0);
          setProfileSkills(extracted);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { profileSkills };
}
