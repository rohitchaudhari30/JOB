import { useState } from 'react';
import type { Campaign } from '../../types';

type Rule = NonNullable<Campaign['rule']>;

/** Targeting fields of a campaign (roles, locations, sources, thresholds) and the edits made to them. */
export function useCampaignRules() {
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [newRoleInput, setNewRoleInput] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [newLocationInput, setNewLocationInput] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(['naukri', 'linkedin']);
  const [autoApplyThreshold, setAutoApplyThreshold] = useState(80);
  const [reviewThreshold, setReviewThreshold] = useState(65);
  const [minExpYears, setMinExpYears] = useState(0);
  const [maxExpYears, setMaxExpYears] = useState(10);
  const [mandatorySkillsInput, setMandatorySkillsInput] = useState('');

  const handleAddRole = () => {
    if (newRoleInput.trim() && !targetRoles.includes(newRoleInput.trim())) {
      setTargetRoles([...targetRoles, newRoleInput.trim()]);
      setNewRoleInput('');
    }
  };

  const handleRemoveRole = (role: string) => {
    setTargetRoles(targetRoles.filter((r) => r !== role));
  };

  const handleAddLocation = () => {
    if (newLocationInput.trim() && !locations.includes(newLocationInput.trim())) {
      setLocations([...locations, newLocationInput.trim()]);
      setNewLocationInput('');
    }
  };

  const handleRemoveLocation = (loc: string) => {
    setLocations(locations.filter((l) => l !== loc));
  };

  const toggleSource = (source: string) => {
    if (selectedSources.includes(source)) {
      if (selectedSources.length > 1) {
        setSelectedSources(selectedSources.filter((s) => s !== source));
      }
    } else {
      setSelectedSources([...selectedSources, source]);
    }
  };

  /** The rule as the API expects it. */
  const rulePayload = () => ({
    auto_apply_threshold: autoApplyThreshold,
    review_threshold: reviewThreshold,
    min_experience_years: minExpYears,
    max_experience_years: maxExpYears,
    target_roles: targetRoles,
    target_locations: locations,
    mandatory_skills: mandatorySkillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    target_platforms: selectedSources,
  });

  /** Load a saved campaign's rule into the form fields. */
  const applyRule = (rule: Rule) => {
    setAutoApplyThreshold(rule.auto_apply_threshold || 80);
    setReviewThreshold(rule.review_threshold || 65);
    setMinExpYears(rule.min_experience_years || 0);
    setMaxExpYears(rule.max_experience_years || 10);
    if (rule.target_roles && rule.target_roles.length > 0) setTargetRoles(rule.target_roles);
    if (rule.target_locations && rule.target_locations.length > 0) setLocations(rule.target_locations);
    if (rule.mandatory_skills) setMandatorySkillsInput(rule.mandatory_skills.join(', '));
    if (rule.target_platforms && rule.target_platforms.length > 0) setSelectedSources(rule.target_platforms);
  };

  return {
    targetRoles,
    setTargetRoles,
    newRoleInput,
    setNewRoleInput,
    locations,
    setLocations,
    newLocationInput,
    setNewLocationInput,
    selectedSources,
    handleAddRole,
    handleRemoveRole,
    handleAddLocation,
    handleRemoveLocation,
    toggleSource,
    rulePayload,
    applyRule,
  };
}
