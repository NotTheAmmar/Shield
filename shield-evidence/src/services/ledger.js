const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function storeFIRHash(firId, hash, privateKey) {
    if (process.env.MOCK_LEDGER === 'true') {
        await sleep(50);
        console.log(`[MOCK LEDGER] storeFIRHash: ${firId} → ${hash}`);
        return { ok: true, mock: true };
    }

    const res = await fetch(`${process.env.LEDGER_URL}/api/ledger/store/fir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firId, hash, privateKey }),
    });

    if (!res.ok) {
        let errBody = '';
        try { errBody = await res.text(); } catch(e) {}
        throw new Error(`Ledger FIR store failed: ${res.status} - ${errBody}`);
    }
    return res.json();
}

async function storeEvidenceHash(evidenceId, firId, hash, privateKey) {
    if (process.env.MOCK_LEDGER === 'true') {
        await sleep(50);
        console.log(`[MOCK LEDGER] storeEvidenceHash: ${evidenceId} (FIR: ${firId}) → ${hash}`);
        return { ok: true, mock: true };
    }

    const res = await fetch(`${process.env.LEDGER_URL}/api/ledger/store/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, firId, hash, privateKey }),
    });

    if (!res.ok) {
        let errBody = '';
        try { errBody = await res.text(); } catch(e) {}
        throw new Error(`Ledger Evidence store failed: ${res.status} - ${errBody}`);
    }
    return res.json();
}

async function getFIRHash(firId) {
    if (process.env.MOCK_LEDGER === 'true') {
        console.log(`[MOCK LEDGER] getFIRHash: ${firId}`);
        return null;
    }

    const res = await fetch(`${process.env.LEDGER_URL}/api/ledger/fir/${encodeURIComponent(firId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Ledger FIR get failed: ${res.status}`);
    const data = await res.json();
    return data.hash;
}

async function getEvidenceHash(evidenceId) {
    if (process.env.MOCK_LEDGER === 'true') {
        console.log(`[MOCK LEDGER] getEvidenceHash: ${evidenceId}`);
        return null;
    }

    const res = await fetch(`${process.env.LEDGER_URL}/api/ledger/evidence/${encodeURIComponent(evidenceId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Ledger Evidence get failed: ${res.status}`);
    const data = await res.json();
    return data.hash;
}

module.exports = { storeFIRHash, storeEvidenceHash, getFIRHash, getEvidenceHash };
