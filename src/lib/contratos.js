import { getContracts, getContract } from './api/endpoints';

const comp_any = 'IUSASOL SUMINISTRADORA ENERGIA';

export default async function fetchContractsWithDetails() {
  try {
    const data = await getContracts(comp_any);
    const contracts = data && data.contracts ? data.contracts : [];

    // Fetch details for each contract in parallel (settled to avoid failure short-circuit)
    const detailPromises = contracts.map((c) => getContract(c.idcode));
    const settled = await Promise.allSettled(detailPromises);

    const results = contracts.map((c, idx) => {
      const detail = settled[idx];
      if (detail.status === 'fulfilled' && detail.value) {
        const detailData = detail.value;
        return {
          nickisol: c.nickisol,
          idcode: c.idcode,
          meters: detailData.meters || []
        };
      }
      return {
        nickisol: c.nickisol,
        idcode: c.idcode,
        meters: [],
        _error: detail.reason ? String(detail.reason) : undefined
      };
    });

    return results;
  } catch (err) {
    console.error('Error fetching contracts', err);
    throw err;
  }
}
