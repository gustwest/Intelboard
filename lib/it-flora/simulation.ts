import { useStore } from '@/store/it-flora/useStore';
import { v4 as uuidv4 } from 'uuid';

export const generateBankFlora = () => {
    const store = useStore.getState();

    // 1. Source Systems
    const coreBankingId = uuidv4();
    store.addSystem({
        id: coreBankingId,
        name: 'Core Banking (T24)',
        type: 'Source System',
        description: 'Main core banking system for accounts and customers.',
        position: { x: 100, y: 100 },
        assets: [
            { id: uuidv4(), name: 'Customers', type: 'Table', systemId: coreBankingId, status: 'Existing', columns: [{ name: 'CustomerID', type: 'INT' }, { name: 'Name', type: 'VARCHAR' }] },
            { id: uuidv4(), name: 'Accounts', type: 'Table', systemId: coreBankingId, status: 'Existing', columns: [{ name: 'AccountID', type: 'INT' }, { name: 'Balance', type: 'DECIMAL' }] },
            { id: uuidv4(), name: 'Transactions', type: 'Table', systemId: coreBankingId, status: 'Existing', columns: [{ name: 'TxID', type: 'INT' }, { name: 'Amount', type: 'DECIMAL' }] },
        ]
    });

    const paymentsEngineId = uuidv4();
    store.addSystem({
        id: paymentsEngineId,
        name: 'Payments Engine',
        type: 'Source System',
        description: 'Handles SEPA and SWIFT payments.',
        position: { x: 100, y: 400 },
        assets: [
            { id: uuidv4(), name: 'PaymentOrders', type: 'Table', systemId: paymentsEngineId, status: 'Existing', columns: [{ name: 'OrderID', type: 'INT' }, { name: 'Status', type: 'VARCHAR' }] },
        ]
    });

    // 2. Data Warehouse (Layered)
    const stagingAreaId = uuidv4();
    store.addSystem({
        id: stagingAreaId,
        name: 'DW Staging Area',
        type: 'Data Warehouse',
        description: 'Raw data landing zone.',
        position: { x: 500, y: 250 },
        assets: [
            { id: uuidv4(), name: 'STG_Customers', type: 'Table', systemId: stagingAreaId, status: 'Existing' },
            { id: uuidv4(), name: 'STG_Accounts', type: 'Table', systemId: stagingAreaId, status: 'Existing' },
        ]
    });

    const dataVaultId = uuidv4();
    store.addSystem({
        id: dataVaultId,
        name: 'Data Vault',
        type: 'Data Vault',
        description: 'Raw Vault and Business Vault.',
        position: { x: 900, y: 250 },
        assets: [
            { id: uuidv4(), name: 'Hub_Customer', type: 'Table', systemId: dataVaultId, status: 'Existing' },
            { id: uuidv4(), name: 'Sat_Customer_Details', type: 'Table', systemId: dataVaultId, status: 'Existing' },
            { id: uuidv4(), name: 'Link_Customer_Account', type: 'Table', systemId: dataVaultId, status: 'Existing' },
        ]
    });

    const dataMartId = uuidv4();
    store.addSystem({
        id: dataMartId,
        name: 'Finance Mart',
        type: 'Data Mart',
        description: 'Dimensional models for Finance.',
        position: { x: 1300, y: 100 },
        assets: [
            { id: uuidv4(), name: 'Dim_Customer', type: 'View', systemId: dataMartId, status: 'Existing' },
            { id: uuidv4(), name: 'Fact_Transactions', type: 'View', systemId: dataMartId, status: 'Existing' },
        ]
    });

    // 3. Reporting
    const pbiReportId = uuidv4();
    store.addSystem({
        id: pbiReportId,
        name: 'Executive Dashboard',
        type: 'PBI Report',
        description: 'Daily liquidity and risk overview.',
        position: { x: 1700, y: 250 },
        assets: [
            { id: uuidv4(), name: 'Liquidity_Dataset', type: 'Dataset', systemId: pbiReportId, status: 'Existing' },
        ]
    });

    // 4. Integrations (Simulated)
    // To link assets, we need to find them in the store state AFTER we added them, 
    // OR we can just use the IDs we generated if we passed them in.
    // Since we passed them in (thanks to store update), we can use them directly if we tracked them.
    // But I defined IDs inline in the assets array.
    // Let's rely on finding them by name for simplicity in this script, or just trust the flow.
    // Actually, since I'm running this synchronously, the store updates might happen immediately.

    // Let's re-fetch the store state to get the actual objects if needed, 
    // but since I didn't save the asset IDs in variables, I have to find them.

    const currentSystems = store.systems; // This might be stale if zustand updates are async/batched? 
    // Zustand updates are synchronous usually.

    // Helper to find asset ID by system ID and asset name
    const findAssetId = (sysId: string, assetName: string) => {
        const sys = useStore.getState().systems.find(s => s.id === sysId);
        return sys?.assets.find(a => a.name === assetName)?.id;
    };

    const custId = findAssetId(coreBankingId, 'Customers');
    if (custId) store.addIntegration({ sourceAssetId: custId, targetSystemId: stagingAreaId, description: 'Daily Batch Load' });

    const stgCustId = findAssetId(stagingAreaId, 'STG_Customers');
    if (stgCustId) store.addIntegration({ sourceAssetId: stgCustId, targetSystemId: dataVaultId, description: 'Load Hubs and Sats' });

    const hubCustId = findAssetId(dataVaultId, 'Hub_Customer');
    if (hubCustId) store.addIntegration({ sourceAssetId: hubCustId, targetSystemId: dataMartId, description: 'Populate Dimensions' });

    const dimCustId = findAssetId(dataMartId, 'Dim_Customer');
    if (dimCustId) store.addIntegration({ sourceAssetId: dimCustId, targetSystemId: pbiReportId, description: 'Power BI Import' });
};
