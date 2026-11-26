import { getProfilesDetailed, DEFAULT_COMPANY, TYM_KWH, TYE_ENERGY } from './api/endpoints';

// Fetch profiles for given id and date range
export async function fetchProfiles({ id, beginDate, endDate }) {
  const data = await getProfilesDetailed({
    id,
    beginDate,
    endDate,
    tym: TYM_KWH,
    tye: TYE_ENERGY,
    company: DEFAULT_COMPANY
  });
  return data && data.profiles ? data.profiles : [];
}

export default fetchProfiles;
