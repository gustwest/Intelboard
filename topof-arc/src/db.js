import Dexie from 'dexie';

export const db = new Dexie('TopofArcDB');

db.version(1).stores({
  systems: '++id, name, type, status, managementAreaId',
  integrations: '++id, sourceSystemId, targetSystemId, type, status',
  dataEntities: '++id, name, systemId, type, classification',
  owners: '++id, name, role, systemId',
  managementAreas: '++id, name, releaseCycle, color',
  releases: '++id, name, managementAreaId, plannedDate, status',
  contracts: '++id, title, type, status, validFrom, validTo',
  annotations: '++id, entityType, entityId, author, createdAt',
});

// Reset and reseed (useful when data gets duplicated during dev)
export async function resetAndReseed() {
  await Promise.all([
    db.systems.clear(),
    db.integrations.clear(),
    db.dataEntities.clear(),
    db.owners.clear(),
    db.managementAreas.clear(),
    db.releases.clear(),
    db.contracts.clear(),
    db.annotations.clear(),
  ]);
  await seedDatabaseForce();
}

// Seed data for demo
export async function seedDatabase() {
  const systemCount = await db.systems.count();
  if (systemCount > 0) return;
  await seedDatabaseForce();
}

async function seedDatabaseForce() {

  // Management Areas
  const areaIds = await db.managementAreas.bulkAdd([
    { name: 'Kundplattform', description: 'CRM & kundhantering', releaseCycle: 'biweekly', color: '#7c3aed' },
    { name: 'Ekonomi & Finans', description: 'Redovisning, fakturering, budget', releaseCycle: 'monthly', color: '#10b981' },
    { name: 'Data & Analytics', description: 'Datalager, BI, rapportering', releaseCycle: 'weekly', color: '#f59e0b' },
    { name: 'E-handel', description: 'Webshop, betalning, logistik', releaseCycle: 'biweekly', color: '#ef4444' },
  ], { allKeys: true });

  // Systems
  const systemIds = await db.systems.bulkAdd([
    { name: 'Salesforce CRM', type: 'application', status: 'current', description: 'Primärt CRM-system för säljorganisationen', managementAreaId: areaIds[0], position: { x: 100, y: 200 }, color: '#7c3aed', icon: 'users' },
    { name: 'SAP ERP', type: 'application', status: 'current', description: 'Ekonomi- och affärssystem', managementAreaId: areaIds[1], position: { x: 500, y: 100 }, color: '#10b981', icon: 'building' },
    { name: 'Snowflake DWH', type: 'database', status: 'current', description: 'Centralt datalager i molnet', managementAreaId: areaIds[2], position: { x: 500, y: 350 }, color: '#f59e0b', icon: 'database' },
    { name: 'Magento Commerce', type: 'application', status: 'current', description: 'E-handelsplattform', managementAreaId: areaIds[3], position: { x: 100, y: 500 }, color: '#ef4444', icon: 'shopping-cart' },
    { name: 'Kafka Event Bus', type: 'platform', status: 'current', description: 'Central event-broker för async-integrationer', managementAreaId: areaIds[2], position: { x: 300, y: 350 }, color: '#06b6d4', icon: 'zap' },
    { name: 'Power BI', type: 'application', status: 'current', description: 'Business Intelligence & visualisering', managementAreaId: areaIds[2], position: { x: 750, y: 350 }, color: '#f59e0b', icon: 'bar-chart-2' },
    { name: 'Stripe Payments', type: 'external', status: 'current', description: 'Extern betalningsgateway', managementAreaId: areaIds[3], position: { x: 100, y: 700 }, color: '#8b5cf6', icon: 'credit-card' },
    { name: 'Ny MDM-plattform', type: 'platform', status: 'target', description: 'Målbild: Master Data Management', managementAreaId: areaIds[2], position: { x: 750, y: 150 }, color: '#ec4899', icon: 'target' },
  ], { allKeys: true });

  // Integrations
  await db.integrations.bulkAdd([
    { sourceSystemId: systemIds[0], targetSystemId: systemIds[4], type: 'Event', protocol: 'Kafka', frequency: 'realtime', direction: 'unidirectional', status: 'active', description: 'Kunddata-events från CRM till Kafka' },
    { sourceSystemId: systemIds[4], targetSystemId: systemIds[2], type: 'Event', protocol: 'Kafka', frequency: 'near-realtime', direction: 'unidirectional', status: 'active', description: 'Konsumerar events till datalager' },
    { sourceSystemId: systemIds[1], targetSystemId: systemIds[2], type: 'Batch', protocol: 'SFTP', frequency: 'daily', direction: 'unidirectional', status: 'active', description: 'Daglig ekonomidata-laddning' },
    { sourceSystemId: systemIds[3], targetSystemId: systemIds[1], type: 'API', protocol: 'REST', frequency: 'realtime', direction: 'bidirectional', status: 'active', description: 'Order- och lagersynk' },
    { sourceSystemId: systemIds[3], targetSystemId: systemIds[6], type: 'API', protocol: 'REST', frequency: 'realtime', direction: 'bidirectional', status: 'active', description: 'Betalningsflöde' },
    { sourceSystemId: systemIds[2], targetSystemId: systemIds[5], type: 'Database', protocol: 'JDBC', frequency: 'hourly', direction: 'unidirectional', status: 'active', description: 'BI-koppling till datalager' },
    { sourceSystemId: systemIds[0], targetSystemId: systemIds[7], type: 'API', protocol: 'REST', frequency: 'realtime', direction: 'bidirectional', status: 'planned', description: 'Planerad MDM-koppling för kunddata' },
    { sourceSystemId: systemIds[3], targetSystemId: systemIds[4], type: 'Event', protocol: 'Kafka', frequency: 'realtime', direction: 'unidirectional', status: 'active', description: 'Orderhändelser till event bus' },
  ]);

  // Data Entities
  await db.dataEntities.bulkAdd([
    { name: 'Kund', type: 'table', description: 'Kundinformation med kontaktuppgifter', systemId: systemIds[0], classification: 'confidential' },
    { name: 'Order', type: 'table', description: 'Orderdata med rader och status', systemId: systemIds[3], classification: 'internal' },
    { name: 'Faktura', type: 'table', description: 'Faktureringsunderlag', systemId: systemIds[1], classification: 'confidential' },
    { name: 'Produkt', type: 'table', description: 'Produktkatalog', systemId: systemIds[3], classification: 'public' },
    { name: 'Transaktion', type: 'topic', description: 'Betalningstransaktioner', systemId: systemIds[6], classification: 'restricted' },
    { name: 'Kundsegment', type: 'view', description: 'Beräknade kundsegment för BI', systemId: systemIds[2], classification: 'internal' },
  ]);

  // Owners
  await db.owners.bulkAdd([
    { name: 'Anna Svensson', email: 'anna.s@company.se', role: 'data_owner', systemId: systemIds[0] },
    { name: 'Erik Johansson', email: 'erik.j@company.se', role: 'information_owner', systemId: systemIds[1] },
    { name: 'Sara Lindberg', email: 'sara.l@company.se', role: 'data_product_owner', systemId: systemIds[2] },
    { name: 'Marcus Berg', email: 'marcus.b@company.se', role: 'technical_owner', systemId: systemIds[4] },
    { name: 'Lisa Ek', email: 'lisa.e@company.se', role: 'data_owner', systemId: systemIds[3] },
  ]);

  // Releases
  await db.releases.bulkAdd([
    { name: 'CRM v4.2', version: '4.2', plannedDate: '2026-05-01', status: 'planned', managementAreaId: areaIds[0], affectedSystemIds: [systemIds[0]] },
    { name: 'SAP PI Update', version: '2.1', plannedDate: '2026-05-15', status: 'planned', managementAreaId: areaIds[1], affectedSystemIds: [systemIds[1]] },
    { name: 'DWH Schema v3', version: '3.0', plannedDate: '2026-04-28', status: 'in-progress', managementAreaId: areaIds[2], affectedSystemIds: [systemIds[2], systemIds[5]] },
    { name: 'Magento 2.5', version: '2.5', plannedDate: '2026-05-10', status: 'planned', managementAreaId: areaIds[3], affectedSystemIds: [systemIds[3]] },
  ]);

  // Contracts
  await db.contracts.bulkAdd([
    {
      title: 'CRM → Kafka Integrationskontrakt',
      type: 'integration',
      status: 'active',
      validFrom: '2025-01-01',
      validTo: '2026-12-31',
      systemIds: [systemIds[0], systemIds[4]],
      integrationIds: [],
      parsedContent: {
        sourceSystem: 'Salesforce CRM',
        targetSystem: 'Kafka Event Bus',
        integrationType: 'Event',
        protocol: 'Kafka',
        frequency: 'realtime',
        dataEntities: ['Kund', 'Kontakt', 'Lead'],
        sla: '99.9% uptime, max 500ms latency',
        dataOwner: 'Anna Svensson',
        informationOwner: 'Erik Johansson',
      },
    },
    {
      title: 'E-handel → SAP Ordersynk Kontrakt',
      type: 'integration',
      status: 'active',
      validFrom: '2025-06-01',
      validTo: '2027-05-31',
      systemIds: [systemIds[3], systemIds[1]],
      integrationIds: [],
      parsedContent: {
        sourceSystem: 'Magento Commerce',
        targetSystem: 'SAP ERP',
        integrationType: 'API',
        protocol: 'REST',
        frequency: 'realtime',
        dataEntities: ['Order', 'Orderad', 'Returer'],
        sla: '99.5% uptime, max 2s response',
        dataOwner: 'Lisa Ek',
        informationOwner: 'Erik Johansson',
      },
    },
  ]);

  // Annotations
  await db.annotations.bulkAdd([
    { entityType: 'system', entityId: systemIds[7], author: 'Gustav', content: 'MDM-plattformen behöver utredas ytterligare. Leverantörsval Q3 2026.', createdAt: new Date().toISOString(), replies: [] },
    { entityType: 'integration', entityId: 1, author: 'Anna S', content: 'Kafka-integrationen fungerar stabilt. Överväg att öka consumer-grupper.', createdAt: new Date().toISOString(), replies: [] },
  ]);
}
