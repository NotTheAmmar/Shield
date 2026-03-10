const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function storeHash(evidenceId, hash) {
    if (process.env.MOCK_LEDGER === 'true') {
        await sleep(50);
        console.log(`[MOCK LEDGER] storeHash: ${evidenceId} → ${hash}`);
        return { ok: true, mock: true };
    }

    const res = await fetch(`${process.env.LEDGER_URL}/api/ledger/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, hash }),
    });

    if (!res.ok) throw new Error(`Ledger store failed: ${res.status}`);
    return res.json();
}

async function getHash(evidenceId) {
    if (process.env.MOCK_LEDGER === 'true') {
        console.log(`[MOCK LEDGER] getHash: ${evidenceId}`);
        return null;
    }

    const res = await fetch(`${process.env.LEDGER_URL}/api/ledger/${evidenceId}`);
    if (!res.ok) throw new Error(`Ledger get failed: ${res.status}`);
    const data = await res.json();
    return data.hash;
}

module.exports = { storeHash, getHash };
