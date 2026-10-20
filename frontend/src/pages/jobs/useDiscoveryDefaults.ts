import { useEffect } from 'react';
import { api } from '../../services/api';

/** Pre-fills the "Find new jobs" form (roles, location, experience) from the candidate profile. */
export function useDiscoveryDefaults(
  setRoles: (v: string) => void,
  setLocation: (v: string) => void,
  setExperience: (v: number) => void,
) {
  useEffect(() => {
    api
      .getProfile()
      .then((prof) => {
        if (!prof) return;
        if (prof.headline) setRoles(prof.headline);
        if (prof.location) setLocation(prof.location);
        if (prof.total_experience_months !== undefined && prof.total_experience_months !== null) {
          setExperience(Math.floor(prof.total_experience_months / 12));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
