import { System, Asset, SystemType } from '@/store/it-flora/useStore';
import { v4 as uuidv4 } from 'uuid';

export interface ParsedIntegration {
    sourceSystem: string;
    targetSystem: string;
    type?: string;
    description?: string;
}

export interface ParsedResult {
    systems: System[];
    integrations: ParsedIntegration[];
    totalAssets: number;
}

export function parseContractText(text: string): ParsedResult {
    const lines = text.split('\n');
    const systems: System[] = [];
    const integrations: ParsedIntegration[] = [];
    let currentSystem: System | null = null;
    let currentSchema: string | undefined = undefined;

    // Helper to create a new system
    const createSystem = (name: string, type: SystemType = 'Other'): System => {
        // Check if system already exists
        const existing = systems.find(s => s.name.toLowerCase() === name.toLowerCase());
        if (existing) return existing;

        const newSystem: System = {
            id: uuidv4(),
            name: name.trim(),
            type,
            position: { x: Math.random() * 500, y: Math.random() * 500 },
            assets: [],
            documents: [],
            ownerId: 'ai-parser',
            sharedWith: []
        };
        systems.push(newSystem);
        return newSystem;
    };

    // Helper to create a new asset
    const createAsset = (name: string, type: string, schema?: string): Asset => ({
        id: uuidv4(),
        name: name.trim(),
        type,
        systemId: currentSystem!.id,
        status: 'Planned',
        verificationStatus: 'Unverified', // Default to Unverified for imported assets
        schema: schema,
        columns: []
    });

    let mainSystem: System | null = null;

    // Global Integration Context
    let globalSourceSystem: string | null = null;
    let globalTargetSystem: string | null = null;
    let globalIntegrationType: string | undefined = undefined;
    let globalPurpose: string | undefined = undefined;

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // 0. Detect Global Integration Metadata (Source/Target/Type/Purpose)
        const sourceMatch = trimmed.match(/^Source system:\s*(.+?)(?:\s*\(|$)/i);
        if (sourceMatch) globalSourceSystem = sourceMatch[1].trim();

        const targetMatch = trimmed.match(/^Target system:\s*(.+?)(?:\s*\(|$)/i);
        if (targetMatch) globalTargetSystem = targetMatch[1].trim();

        const typeMatch = trimmed.match(/^Integration type:\s*(.+)$/i);
        if (typeMatch) globalIntegrationType = typeMatch[1].trim();

        const purposeMatch = trimmed.match(/^Purpose:\s*(.+)$/i);
        if (purposeMatch) globalPurpose = purposeMatch[1].trim();

        // 1. Detect System Headers
        // Patterns: "System: Name", "Data Product Name: Name", "## Name System"
        const systemMatch = trimmed.match(/^(?:(?:Source|Target)\s+)?(?:System|App|Service|Data Product Name):\s*(.+?)(?:\s*\(|$)/i) ||
            trimmed.match(/^##\s*(.+?)(?:\s*System)?$/i) ||
            trimmed.match(/^(.+?)\s*\((?:System|App|Service)\)$/i);

        if (systemMatch) {
            const name = systemMatch[1].replace(/[:#]/g, '').trim();
            currentSystem = createSystem(name);
            if (!mainSystem) mainSystem = currentSystem; // First detected system is likely the main one
            currentSchema = undefined; // Reset schema for new system
            return;
        }

        // 1.5 Detect Context Switch (Header mentioning a known system)
        const headerSystemMatch = trimmed.match(/^(?:[\d\.]+|#+)\s+.*(?:in|for|of)\s+(.+?)(?::|$)/i);
        if (headerSystemMatch) {
            const potentialSystemName = headerSystemMatch[1].trim();
            const matchedSystem = systems.find(s =>
                potentialSystemName.toLowerCase().includes(s.name.toLowerCase()) ||
                s.name.toLowerCase().includes(potentialSystemName.toLowerCase())
            );
            if (matchedSystem) {
                currentSystem = matchedSystem;
                currentSchema = undefined;
                return;
            }
        }

        // 1.6 Detect "Data Sources" Table Context
        // Match "Name (Type) ... Description" OR "Name Type Description" (Tab/Space separated)
        // We need to be careful. "Source Type Description" is a header.
        if (trimmed.match(/^Source\s+Type\s+Description/i)) return;

        // Regex: Name (Start of line) + Separator + Type + Separator + Description
        // Separator: Tab OR 2+ spaces
        const tableRowMatch = trimmed.match(/^([A-Z][\w\s\(\)]+?)(?:\t|\s{2,})([A-Z][\w\s]+)(?:(?:\t|\s{2,})(.+))?$/);

        if (tableRowMatch && !trimmed.startsWith('-') && !trimmed.match(/^\d+\./)) {
            const namePart = tableRowMatch[1].trim();
            // Clean name: remove parens if they look like type info, or keep them?
            // "CBS (Core Banking System)" -> Keep as name? Or "CBS"?
            // Let's keep the full name for now or try to extract.
            const name = namePart.replace(/\s*\(.*?\)$/, '').trim();

            // Ignore headers like "Field"
            if (name === 'Field' || name === 'Source') return;

            // Check if it looks like a system
            // If we are in "Data Sources" section (heuristic: we just saw the header or previous line was a source), this is safer.
            // For now, let's just create it.
            createSystem(name, 'Source System');
            return;
        }


        // 2. Detect Schema Headers or Context
        // Also detect "Data Structure" header -> Switch to Main System
        if (trimmed.match(/^[\d\.]+\s*Data Structure/i) && mainSystem) {
            currentSystem = mainSystem;
            currentSchema = undefined;
            return;
        }

        const schemaMatch = trimmed.match(/^(?:Schema:|###)\s*(.+)$/i);
        if (schemaMatch && currentSystem) {
            currentSchema = schemaMatch[1].trim();
            return;
        }

        // 3. Detect Assets
        if (currentSystem) {
            // Explicit Type prefixes: "3.1 Table: Name"
            const typePrefixMatch = trimmed.match(/^(?:[\d\.]+\s+)?(Table|View|File|Report|API|Topic):\s*(.+)$/i);
            if (typePrefixMatch) {
                const type = typePrefixMatch[1];
                const namePart = typePrefixMatch[2];
                const schemaNameMatch = namePart.match(/^(\w+)\.(.+)$/);

                if (schemaNameMatch) {
                    const schema = schemaNameMatch[1];
                    const name = schemaNameMatch[2];
                    currentSystem.assets.push(createAsset(name, type, schema));
                } else {
                    currentSystem.assets.push(createAsset(namePart, type, currentSchema));
                }
                return;
            }

            // "Table name: SCHEMA.NAME"
            const tableNameMatch = trimmed.match(/^(?:Table name|Name):\s*(?:(\w+)\.)?(.+)$/i);
            if (tableNameMatch) {
                const schema = tableNameMatch[1] || currentSchema;
                const name = tableNameMatch[2];
                const lastAsset = currentSystem.assets[currentSystem.assets.length - 1];
                if (lastAsset && (lastAsset.name === name || name.includes(lastAsset.name))) {
                    if (schema) lastAsset.schema = schema;
                    lastAsset.name = name;
                } else {
                    const isView = trimmed.toLowerCase().startsWith('view');
                    currentSystem.assets.push(createAsset(name, isView ? 'View' : 'Table', schema));
                }
                return;
            }

            // List items: "- Name (Type)"
            const listMatch = trimmed.match(/^[-*]\s*(.+?)\s*\((.+?)\)$/);
            if (listMatch) {
                const name = listMatch[1];
                const type = listMatch[2];
                currentSystem.assets.push(createAsset(name, type, currentSchema));
                return;
            }

            // 4. Detect Columns
            if (currentSystem.assets.length > 0) {
                const lastAsset = currentSystem.assets[currentSystem.assets.length - 1];

                // Skip headers
                if (trimmed.match(/^(?:Column|Field)\s+(?:Type|Format)/i)) return;

                // Regex for column: Name + Type + ...
                // Support "account_id String UUID Yes ..." (Tab or space separated)
                const columnMatch = trimmed.match(/^([a-zA-Z0-9_]+)[\t\s]+([a-zA-Z0-9_]+(?:\(\d+(?:,\d+)?\))?|Enum(?::\s*\[.*?\])?)/i);

                if (columnMatch) {
                    const colName = columnMatch[1];
                    const colType = columnMatch[2];
                    // Avoid false positives
                    if (['Table', 'View', 'Field', 'Column'].includes(colName)) return;

                    if (!lastAsset.columns) lastAsset.columns = [];
                    lastAsset.columns.push({ name: colName, type: colType });
                    return;
                }
            }
        }
    });

    // Fallback: If the text is just a list of names without "System:" prefix, 
    // create a generic "Imported System"
    if (systems.length === 0 && lines.length > 0) {
        const fallbackSystem = createSystem('Imported System');
        let hasAssets = false;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
                const name = trimmed.replace(/^[-*]\s*/, '');
                fallbackSystem.assets.push(createAsset(name, 'Table'));
                hasAssets = true;
            }
        });

        if (hasAssets) {
            // Only add if not already added (createSystem adds to array)
            if (!systems.includes(fallbackSystem)) systems.push(fallbackSystem);
        }
    }

    // Create Integration if global metadata found
    if (globalSourceSystem && globalTargetSystem) {
        integrations.push({
            sourceSystem: globalSourceSystem,
            targetSystem: globalTargetSystem,
            type: globalIntegrationType,
            description: globalPurpose
        });
    }

    const totalAssets = systems.reduce((acc, sys) => acc + sys.assets.length, 0);

    return { systems, integrations, totalAssets };
}
