export type SystemType =
    | 'Source'
    | 'DataWarehouse'
    | 'Reporting'
    | 'API'
    | 'Middleware'
    | 'ThirdParty';

export type DataSensitivity =
    | 'Public'
    | 'Internal'
    | 'Confidential'
    | 'PII'
    | 'StrictlyConfidential';

export interface DataAsset {
    id: string;
    name: string;
    description: string;
    sensitivity: DataSensitivity;
    tags?: string[];
}

export interface System {
    id: string;
    name: string;
    type: SystemType;
    description: string;
    owner?: string;
    // Visual properties for the graph
    position?: { x: number; y: number };
}

export interface Integration {
    id: string;
    sourceSystemId: string;
    targetSystemId: string;
    dataAssets: string[]; // IDs of DataAssets
    frequency: string; // e.g., "Real-time", "Daily", "Weekly"
    protocol: string; // e.g., "REST", "SFTP", "Kafka"
    description?: string;
}
