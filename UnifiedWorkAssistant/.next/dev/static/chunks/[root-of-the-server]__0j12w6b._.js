(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/store.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* =============================================
   UnifiedWorkAssistant — Data Store
   SAFe Hierarchy: Epic → Feature → User Story → Task
   ============================================= */ // ── Types ──
__turbopack_context__.s([
    "addTranscriptSegment",
    ()=>addTranscriptSegment,
    "createActionItem",
    ()=>createActionItem,
    "createComment",
    ()=>createComment,
    "createEpic",
    ()=>createEpic,
    "createFeature",
    ()=>createFeature,
    "createMeeting",
    ()=>createMeeting,
    "createNote",
    ()=>createNote,
    "createPI",
    ()=>createPI,
    "createPIObjective",
    ()=>createPIObjective,
    "createSprint",
    ()=>createSprint,
    "createSprintCapacity",
    ()=>createSprintCapacity,
    "createTask",
    ()=>createTask,
    "createTeam",
    ()=>createTeam,
    "createTeamMember",
    ()=>createTeamMember,
    "createUserStory",
    ()=>createUserStory,
    "deleteActionItem",
    ()=>deleteActionItem,
    "deleteComment",
    ()=>deleteComment,
    "deleteEpic",
    ()=>deleteEpic,
    "deleteFeature",
    ()=>deleteFeature,
    "deleteNote",
    ()=>deleteNote,
    "deleteTask",
    ()=>deleteTask,
    "deleteTeam",
    ()=>deleteTeam,
    "deleteTeamMember",
    ()=>deleteTeamMember,
    "deleteUserStory",
    ()=>deleteUserStory,
    "getActionItem",
    ()=>getActionItem,
    "getActionItems",
    ()=>getActionItems,
    "getComments",
    ()=>getComments,
    "getEpic",
    ()=>getEpic,
    "getEpics",
    ()=>getEpics,
    "getFeature",
    ()=>getFeature,
    "getFeatures",
    ()=>getFeatures,
    "getMeeting",
    ()=>getMeeting,
    "getMeetings",
    ()=>getMeetings,
    "getNote",
    ()=>getNote,
    "getNotes",
    ()=>getNotes,
    "getPI",
    ()=>getPI,
    "getPIObjectives",
    ()=>getPIObjectives,
    "getPIs",
    ()=>getPIs,
    "getSprint",
    ()=>getSprint,
    "getSprintCapacity",
    ()=>getSprintCapacity,
    "getSprints",
    ()=>getSprints,
    "getTask",
    ()=>getTask,
    "getTasks",
    ()=>getTasks,
    "getTeam",
    ()=>getTeam,
    "getTeamMembers",
    ()=>getTeamMembers,
    "getTeams",
    ()=>getTeams,
    "getUserStories",
    ()=>getUserStories,
    "getUserStory",
    ()=>getUserStory,
    "seedDemoData",
    ()=>seedDemoData,
    "updateActionItem",
    ()=>updateActionItem,
    "updateEpic",
    ()=>updateEpic,
    "updateFeature",
    ()=>updateFeature,
    "updateMeeting",
    ()=>updateMeeting,
    "updateNote",
    ()=>updateNote,
    "updatePI",
    ()=>updatePI,
    "updatePIObjective",
    ()=>updatePIObjective,
    "updateSprintCapacity",
    ()=>updateSprintCapacity,
    "updateTask",
    ()=>updateTask,
    "updateTeamMember",
    ()=>updateTeamMember,
    "updateUserStory",
    ()=>updateUserStory
]);
// ── Generic Helpers ──
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
function getAll(key) {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
}
function saveAll(key, items) {
    localStorage.setItem(key, JSON.stringify(items));
}
function createItem(key, data) {
    const items = getAll(key);
    const item = {
        ...data,
        id: genId(),
        createdAt: new Date().toISOString()
    };
    items.push(item);
    saveAll(key, items);
    return item;
}
function updateItem(key, id, updates) {
    const items = getAll(key);
    const idx = items.findIndex((i)=>i.id === id);
    if (idx === -1) return null;
    items[idx] = {
        ...items[idx],
        ...updates,
        updatedAt: new Date().toISOString()
    };
    saveAll(key, items);
    return items[idx];
}
function deleteItem(key, id) {
    const items = getAll(key);
    const filtered = items.filter((i)=>i.id !== id);
    if (filtered.length === items.length) return false;
    saveAll(key, filtered);
    return true;
}
function getItem(key, id) {
    return getAll(key).find((i)=>i.id === id);
}
const getEpics = ()=>getAll('uwa_epics');
const getEpic = (id)=>getItem('uwa_epics', id);
const createEpic = (data)=>createItem('uwa_epics', {
        ...data,
        updatedAt: new Date().toISOString()
    });
const updateEpic = (id, updates)=>updateItem('uwa_epics', id, updates);
const deleteEpic = (id)=>deleteItem('uwa_epics', id);
const getFeatures = (epicId)=>{
    const all = getAll('uwa_features');
    return epicId ? all.filter((f)=>f.epicId === epicId) : all;
};
const getFeature = (id)=>getItem('uwa_features', id);
const createFeature = (data)=>createItem('uwa_features', {
        ...data,
        updatedAt: new Date().toISOString()
    });
const updateFeature = (id, u)=>updateItem('uwa_features', id, u);
const deleteFeature = (id)=>deleteItem('uwa_features', id);
const getUserStories = (featureId)=>{
    const all = getAll('uwa_stories');
    return featureId ? all.filter((s)=>s.featureId === featureId) : all;
};
const getUserStory = (id)=>getItem('uwa_stories', id);
const createUserStory = (data)=>createItem('uwa_stories', {
        ...data,
        updatedAt: new Date().toISOString()
    });
const updateUserStory = (id, u)=>updateItem('uwa_stories', id, u);
const deleteUserStory = (id)=>deleteItem('uwa_stories', id);
const getTasks = (userStoryId)=>{
    const all = getAll('uwa_tasks');
    return userStoryId ? all.filter((t)=>t.userStoryId === userStoryId) : all;
};
const getTask = (id)=>getItem('uwa_tasks', id);
const createTask = (data)=>createItem('uwa_tasks', {
        ...data,
        updatedAt: new Date().toISOString()
    });
const updateTask = (id, u)=>updateItem('uwa_tasks', id, u);
const deleteTask = (id)=>deleteItem('uwa_tasks', id);
const getPIs = ()=>getAll('uwa_pis');
const getPI = (id)=>getItem('uwa_pis', id);
const createPI = (data)=>createItem('uwa_pis', data);
const updatePI = (id, u)=>updateItem('uwa_pis', id, u);
const getSprints = (piId)=>{
    const all = getAll('uwa_sprints');
    return piId ? all.filter((s)=>s.piId === piId) : all;
};
const getSprint = (id)=>getItem('uwa_sprints', id);
const createSprint = (data)=>createItem('uwa_sprints', data);
const getPIObjectives = (piId)=>{
    const all = getAll('uwa_piobj');
    return piId ? all.filter((o)=>o.piId === piId) : all;
};
const createPIObjective = (data)=>createItem('uwa_piobj', data);
const updatePIObjective = (id, u)=>updateItem('uwa_piobj', id, u);
const getTeams = ()=>getAll('uwa_teams');
const getTeam = (id)=>getItem('uwa_teams', id);
const createTeam = (data)=>createItem('uwa_teams', data);
const deleteTeam = (id)=>deleteItem('uwa_teams', id);
const getTeamMembers = (teamId)=>{
    const all = getAll('uwa_members');
    return teamId ? all.filter((m)=>m.teamId === teamId) : all;
};
const createTeamMember = (data)=>createItem('uwa_members', data);
const updateTeamMember = (id, u)=>updateItem('uwa_members', id, u);
const deleteTeamMember = (id)=>deleteItem('uwa_members', id);
const getSprintCapacity = (sprintId)=>getAll('uwa_capacity').filter((c)=>c.sprintId === sprintId);
const createSprintCapacity = (data)=>{
    const items = getAll('uwa_capacity');
    const item = {
        ...data,
        id: genId()
    };
    items.push(item);
    saveAll('uwa_capacity', items);
    return item;
};
const updateSprintCapacity = (id, u)=>updateItem('uwa_capacity', id, u);
const getMeetings = ()=>getAll('uwa_meetings');
const getMeeting = (id)=>getItem('uwa_meetings', id);
const createMeeting = (data)=>createItem('uwa_meetings', {
        ...data,
        transcript: []
    });
const updateMeeting = (id, u)=>updateItem('uwa_meetings', id, u);
const addTranscriptSegment = (meetingId, segment)=>{
    const meeting = getMeeting(meetingId);
    if (!meeting) return;
    meeting.transcript.push(segment);
    updateMeeting(meetingId, {
        transcript: meeting.transcript
    });
};
const getActionItems = (workItemId)=>{
    const all = getAll('uwa_actions');
    return workItemId ? all.filter((a)=>a.workItemId === workItemId) : all;
};
const getActionItem = (id)=>getItem('uwa_actions', id);
const createActionItem = (data)=>createItem('uwa_actions', {
        ...data,
        updatedAt: new Date().toISOString()
    });
const updateActionItem = (id, u)=>updateItem('uwa_actions', id, u);
const deleteActionItem = (id)=>deleteItem('uwa_actions', id);
const getComments = (workItemId)=>getAll('uwa_comments').filter((c)=>c.workItemId === workItemId);
const createComment = (data)=>createItem('uwa_comments', data);
const deleteComment = (id)=>deleteItem('uwa_comments', id);
const getNotes = ()=>getAll('uwa_notes');
const getNote = (id)=>getItem('uwa_notes', id);
const createNote = (data)=>createItem('uwa_notes', {
        ...data,
        updatedAt: new Date().toISOString()
    });
const updateNote = (id, u)=>updateItem('uwa_notes', id, u);
const deleteNote = (id)=>deleteItem('uwa_notes', id);
function seedDemoData() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    if (localStorage.getItem('uwa_seeded')) return;
    // Teams
    const teamA = createTeam({
        name: 'Steam',
        color: '#5B9BD5'
    });
    const teamB = createTeam({
        name: 'Accelerate',
        color: '#5CB88A'
    });
    // Members
    createTeamMember({
        name: 'Gustav Westergren',
        role: 'Tech Lead',
        teamId: teamA.id,
        defaultCapacityPerSprint: 60
    });
    createTeamMember({
        name: 'Anna Lindqvist',
        role: 'Developer',
        teamId: teamA.id,
        defaultCapacityPerSprint: 64
    });
    createTeamMember({
        name: 'Erik Johansson',
        role: 'Developer',
        teamId: teamA.id,
        defaultCapacityPerSprint: 64
    });
    createTeamMember({
        name: 'Maria Svensson',
        role: 'UX Designer',
        teamId: teamB.id,
        defaultCapacityPerSprint: 48
    });
    createTeamMember({
        name: 'Johan Karlsson',
        role: 'Developer',
        teamId: teamB.id,
        defaultCapacityPerSprint: 64
    });
    // PI
    const pi = createPI({
        name: 'PI 2026.2',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
        status: 'active'
    });
    // Sprints
    const s1 = createSprint({
        name: 'Sprint 1',
        startDate: '2026-04-01',
        endDate: '2026-04-14',
        piId: pi.id,
        goal: 'Grundläggande SAFe-struktur'
    });
    const s2 = createSprint({
        name: 'Sprint 2',
        startDate: '2026-04-15',
        endDate: '2026-04-28',
        piId: pi.id,
        goal: 'Azure DevOps Integration'
    });
    const s3 = createSprint({
        name: 'Sprint 3',
        startDate: '2026-04-29',
        endDate: '2026-05-12',
        piId: pi.id,
        goal: 'AI Mötesanalys'
    });
    const s4 = createSprint({
        name: 'Sprint 4',
        startDate: '2026-05-13',
        endDate: '2026-05-26',
        piId: pi.id,
        goal: 'Resursplanering & Burndown'
    });
    const s5 = createSprint({
        name: 'Sprint 5',
        startDate: '2026-05-27',
        endDate: '2026-06-09',
        piId: pi.id,
        goal: 'Teams Integration'
    });
    // Epics
    const epic1 = createEpic({
        title: 'Unified Work Platform',
        description: 'Konsoliderad arbetsplattform med SAFe-stöd',
        status: 'in_progress',
        color: '#ED7770'
    });
    const epic2 = createEpic({
        title: 'AI Meeting Intelligence',
        description: 'Intelligent möteshantering med transkribering och analys',
        status: 'analysis',
        color: '#5B9BD5'
    });
    const epic3 = createEpic({
        title: 'Azure DevOps Bridge',
        description: 'Bi-direktionell synk med Azure DevOps',
        status: 'draft',
        color: '#5CB88A'
    });
    // Features
    const f1 = createFeature({
        title: 'SAFe Backlog Hierarchy',
        description: 'Epic → Feature → User Story → Task',
        status: 'in_progress',
        epicId: epic1.id,
        storyPoints: 21,
        sprintId: s1.id
    });
    const f2 = createFeature({
        title: 'PI Planning Board',
        description: 'Visuell PI-planering med dependencies',
        status: 'new',
        epicId: epic1.id,
        storyPoints: 13,
        sprintId: s2.id
    });
    const f3 = createFeature({
        title: 'Sprint Board & Burndown',
        description: 'Kanban + burndown charts per sprint',
        status: 'new',
        epicId: epic1.id,
        storyPoints: 8,
        sprintId: s2.id
    });
    const f4 = createFeature({
        title: 'Live Transcription',
        description: 'Web Speech + Deepgram transkribering',
        status: 'in_progress',
        epicId: epic2.id,
        storyPoints: 13,
        sprintId: s1.id
    });
    const f5 = createFeature({
        title: 'AI Post-Processing',
        description: 'Automatisk sammanfattning, action items, beroenden',
        status: 'new',
        epicId: epic2.id,
        storyPoints: 21,
        sprintId: s3.id
    });
    const f6 = createFeature({
        title: 'Work Item Sync',
        description: 'Tvåvägs-synk med Azure DevOps API',
        status: 'new',
        epicId: epic3.id,
        storyPoints: 21,
        sprintId: s4.id
    });
    // PI Objectives
    createPIObjective({
        title: 'Fungerande SAFe-backlog med hierarki',
        description: 'Komplett Epic→Feature→Story→Task',
        businessValue: 9,
        committed: true,
        status: 'in_progress',
        piId: pi.id
    });
    createPIObjective({
        title: 'Live-transkribering av möten',
        description: 'Realtids-transkribering via Web Speech API',
        businessValue: 8,
        committed: true,
        status: 'in_progress',
        piId: pi.id
    });
    createPIObjective({
        title: 'Azure DevOps bi-directional sync',
        description: 'Synk ärenden med befintligt Azure DevOps',
        businessValue: 10,
        committed: false,
        status: 'pending',
        piId: pi.id
    });
    // User Stories
    const us1 = createUserStory({
        title: 'Som användare vill jag kunna skapa Epics',
        description: 'CRUD för epics',
        acceptanceCriteria: 'Skapa, redigera, radera epics.',
        status: 'done',
        featureId: f1.id,
        sprintId: s1.id,
        assignee: 'Gustav',
        storyPoints: 3
    });
    const us2 = createUserStory({
        title: 'Som användare vill jag kunna skapa Features',
        description: 'CRUD med epic-koppling',
        acceptanceCriteria: 'Feature skapas under Epic.',
        status: 'in_progress',
        featureId: f1.id,
        sprintId: s1.id,
        assignee: 'Anna',
        storyPoints: 5
    });
    const us3 = createUserStory({
        title: 'Hierarkisk trädvy i backlog',
        description: 'Expanderbar vy Epic→Feature→Story',
        acceptanceCriteria: 'Alla nivåer kan expanderas.',
        status: 'new',
        featureId: f1.id,
        sprintId: s1.id,
        assignee: 'Erik',
        storyPoints: 8
    });
    const us4 = createUserStory({
        title: 'Mikrofon-transkribering',
        description: 'getUserMedia + Web Speech API',
        acceptanceCriteria: 'Realtidstext visas.',
        status: 'done',
        featureId: f4.id,
        sprintId: s1.id,
        assignee: 'Gustav',
        storyPoints: 5
    });
    createUserStory({
        title: 'Tab Audio Capture',
        description: 'getDisplayMedia för tab-ljud',
        acceptanceCriteria: 'Chrome tab-ljud fångas.',
        status: 'new',
        featureId: f4.id,
        sprintId: s2.id,
        assignee: 'Johan',
        storyPoints: 8
    });
    // Tasks
    createTask({
        title: 'Implementera Epic CRUD',
        description: 'Store + UI',
        status: 'done',
        userStoryId: us1.id,
        assignee: 'Gustav',
        remainingHours: 0,
        originalEstimate: 4,
        priority: 'high'
    });
    createTask({
        title: 'Feature CRUD med Epic-select',
        description: '',
        status: 'in_progress',
        userStoryId: us2.id,
        assignee: 'Anna',
        remainingHours: 3,
        originalEstimate: 6,
        priority: 'high'
    });
    createTask({
        title: 'Trädkomponent med expand/collapse',
        description: '',
        status: 'todo',
        userStoryId: us3.id,
        assignee: 'Erik',
        remainingHours: 8,
        originalEstimate: 8,
        priority: 'medium'
    });
    createTask({
        title: 'Web Speech API-integration',
        description: '',
        status: 'done',
        userStoryId: us4.id,
        assignee: 'Gustav',
        remainingHours: 0,
        originalEstimate: 6,
        priority: 'high'
    });
    // Action Items
    createActionItem({
        title: 'Skaffa Azure DevOps PAT',
        description: 'Personal Access Token med Work Items scope',
        assignee: 'Gustav',
        dueDate: '2026-04-20',
        priority: 'high',
        status: 'open'
    });
    createActionItem({
        title: 'Besluta Rich Text Editor',
        description: 'TipTap vs Slate.js — test och jämförelse',
        assignee: 'Anna',
        dueDate: '2026-04-18',
        priority: 'medium',
        status: 'in_progress',
        workItemId: f1.id,
        workItemType: 'feature'
    });
    createActionItem({
        title: 'Deepgram API-nyckel',
        description: 'Skapa konto och hämta API key',
        assignee: 'Johan',
        dueDate: '2026-04-25',
        priority: 'medium',
        status: 'open',
        workItemId: f4.id,
        workItemType: 'feature'
    });
    // Meetings
    createMeeting({
        title: 'PI Planning Day 1',
        scheduledAt: '2026-04-17T09:00:00',
        status: 'scheduled',
        participants: [
            'Gustav',
            'Anna',
            'Erik',
            'Maria',
            'Johan'
        ],
        workItemId: pi.id,
        workItemType: undefined,
        projectId: undefined
    });
    createMeeting({
        title: 'Sprint 1 Retrospective',
        scheduledAt: '2026-04-14T15:00:00',
        status: 'completed',
        participants: [
            'Gustav',
            'Anna',
            'Erik'
        ],
        startedAt: '2026-04-14T15:00:00',
        endedAt: '2026-04-14T15:45:00',
        projectId: undefined
    });
    // Notes
    createNote({
        title: 'SAFe Implementeringsnoteringar',
        content: 'Vi använder SAFe Essential-konfigurationen.\n\n- PI = 5 sprints × 2 veckor\n- Varje team har en dedikerad PO\n- IP-sprint används för innovation och planering',
        tags: [
            'safe',
            'process'
        ],
        projectId: undefined
    });
    createNote({
        title: 'Azure DevOps API-noteringar',
        content: 'REST API v7.1\n\nEndpoint: dev.azure.com/{org}/{project}/_apis/wit/workitems\n\nAnvänd WIQL för trädqueries:\nMODE (Recursive) för hierarki',
        tags: [
            'azure',
            'api'
        ],
        projectId: undefined
    });
    localStorage.setItem('uwa_seeded', 'true');
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/store.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
function DashboardPage() {
    _s();
    const [projects, setProjects] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [tasks, setTasks] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [meetings, setMeetings] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [actionItems, setActionItems] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [mounted, setMounted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DashboardPage.useEffect": ()=>{
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["seedDemoData"])();
            setProjects((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getProjects"])());
            setTasks((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getTasks"])());
            setMeetings((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getMeetings"])());
            setActionItems((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getActionItems"])());
            setMounted(true);
        }
    }["DashboardPage.useEffect"], []);
    if (!mounted) return null;
    const activeTasks = tasks.filter((t)=>t.status === 'in_progress');
    const openActions = actionItems.filter((a)=>a.status !== 'done');
    const upcomingMeetings = meetings.filter((m)=>m.status === 'scheduled');
    const activeProjects = projects.filter((p)=>p.status === 'active');
    const formatDate = (d)=>{
        if (!d) return '';
        const date = new Date(d);
        const now = new Date();
        const diff = date.getTime() - now.getTime();
        const days = Math.ceil(diff / 86400000);
        if (days === 0) return 'Idag';
        if (days === 1) return 'Imorgon';
        if (days < 7) return `Om ${days} dagar`;
        return date.toLocaleDateString('sv-SE', {
            day: 'numeric',
            month: 'short'
        });
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "page-header",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                children: "Dashboard"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 49,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "page-header-subtitle",
                                children: "Översikt av alla dina arbetsflöden"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 50,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 48,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: 'flex',
                            gap: 'var(--space-sm)'
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                href: "/meetings?new=1",
                                className: "btn btn-primary",
                                children: "🎙️ Nytt möte"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 53,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                href: "/transcribe",
                                className: "btn btn-secondary",
                                children: "📝 Transkribera"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 56,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 52,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "page-body",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "stats-grid",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card animate-in",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-header",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "card-title",
                                            children: "📁 Aktiva Projekt"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 67,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 66,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-stat accent",
                                        children: activeProjects.length
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 69,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        style: {
                                            fontSize: '0.8rem',
                                            color: 'var(--text-tertiary)',
                                            marginTop: '4px'
                                        },
                                        children: [
                                            projects.filter((p)=>p.status === 'planning').length,
                                            " under planering"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 70,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 65,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card animate-in",
                                style: {
                                    animationDelay: '50ms'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-header",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "card-title",
                                            children: "📋 Pågående Tasks"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 76,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 75,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-stat",
                                        style: {
                                            color: 'var(--color-info)'
                                        },
                                        children: activeTasks.length
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 78,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        style: {
                                            fontSize: '0.8rem',
                                            color: 'var(--text-tertiary)',
                                            marginTop: '4px'
                                        },
                                        children: [
                                            tasks.filter((t)=>t.status === 'backlog').length,
                                            " i backlog"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 79,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 74,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card animate-in",
                                style: {
                                    animationDelay: '100ms'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-header",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "card-title",
                                            children: "✅ Öppna Actions"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 85,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 84,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-stat warning",
                                        children: openActions.length
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 87,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        style: {
                                            fontSize: '0.8rem',
                                            color: 'var(--text-tertiary)',
                                            marginTop: '4px'
                                        },
                                        children: [
                                            openActions.filter((a)=>a.priority === 'high').length,
                                            " med hög prioritet"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 88,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 83,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card animate-in",
                                style: {
                                    animationDelay: '150ms'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-header",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "card-title",
                                            children: "🎙️ Kommande Möten"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 94,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 93,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-stat success",
                                        children: upcomingMeetings.length
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 96,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        style: {
                                            fontSize: '0.8rem',
                                            color: 'var(--text-tertiary)',
                                            marginTop: '4px'
                                        },
                                        children: [
                                            meetings.filter((m)=>m.status === 'completed').length,
                                            " avslutade"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 97,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 92,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 64,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "content-grid",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card animate-in",
                                style: {
                                    animationDelay: '200ms'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-header",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "card-title",
                                                children: "📁 Projekt"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 108,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                href: "/projects",
                                                className: "btn btn-ghost btn-sm",
                                                children: "Visa alla →"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 109,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 107,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: projects.map((project)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                href: `/projects/${project.id}`,
                                                className: "list-item",
                                                style: {
                                                    textDecoration: 'none',
                                                    color: 'inherit'
                                                },
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        style: {
                                                            width: 10,
                                                            height: 10,
                                                            borderRadius: '50%',
                                                            background: project.color,
                                                            flexShrink: 0
                                                        }
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 114,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "list-item-content",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "list-item-title",
                                                                children: project.name
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 116,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "list-item-subtitle",
                                                                children: project.description
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 117,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 115,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: `badge ${project.status === 'active' ? 'badge-success' : project.status === 'planning' ? 'badge-info' : 'badge-accent'}`,
                                                        children: project.status === 'active' ? 'Aktiv' : project.status === 'planning' ? 'Planering' : 'Avslutad'
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 119,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, project.id, true, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 113,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 111,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 106,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card animate-in",
                                style: {
                                    animationDelay: '250ms'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-header",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "card-title",
                                                children: "✅ Action Items"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 130,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                href: "/actions",
                                                className: "btn btn-ghost btn-sm",
                                                children: "Visa alla →"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 131,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 129,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: openActions.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "empty-state",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: "Inga öppna action items 🎉"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 136,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 135,
                                            columnNumber: 17
                                        }, this) : openActions.slice(0, 5).map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "list-item",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: `priority-indicator priority-${item.priority}`
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 140,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "list-item-content",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "list-item-title",
                                                                children: item.title
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 142,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "list-item-subtitle",
                                                                children: [
                                                                    item.assignee && `${item.assignee} · `,
                                                                    item.dueDate && formatDate(item.dueDate)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 143,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 141,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: `badge ${item.priority === 'high' ? 'badge-danger' : item.priority === 'medium' ? 'badge-warning' : 'badge-info'}`,
                                                        children: item.priority === 'high' ? 'Hög' : item.priority === 'medium' ? 'Medium' : 'Låg'
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 148,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, item.id, true, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 139,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 133,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 128,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card animate-in",
                                style: {
                                    animationDelay: '300ms'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-header",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "card-title",
                                                children: "🎙️ Kommande Möten"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 159,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                href: "/meetings",
                                                className: "btn btn-ghost btn-sm",
                                                children: "Visa alla →"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 160,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 158,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: upcomingMeetings.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "empty-state",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: "Inga kommande möten"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 165,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 164,
                                            columnNumber: 17
                                        }, this) : upcomingMeetings.map((meeting)=>{
                                            const project = projects.find((p)=>p.id === meeting.projectId);
                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                href: `/meetings/${meeting.id}`,
                                                className: "list-item",
                                                style: {
                                                    textDecoration: 'none',
                                                    color: 'inherit'
                                                },
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        style: {
                                                            fontSize: '1.4rem'
                                                        },
                                                        children: "📅"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 171,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "list-item-content",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "list-item-title",
                                                                children: meeting.title
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 173,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "list-item-subtitle",
                                                                children: [
                                                                    formatDate(meeting.scheduledAt),
                                                                    " · ",
                                                                    meeting.participants.join(', '),
                                                                    project && ` · ${project.name}`
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 174,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 172,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "badge badge-info",
                                                        children: "Planerat"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 179,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, meeting.id, true, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 170,
                                                columnNumber: 19
                                            }, this);
                                        })
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 162,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 157,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card animate-in",
                                style: {
                                    animationDelay: '350ms'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "card-header",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "card-title",
                                            children: "⚡ Senaste Aktivitet"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 189,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 188,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: activeTasks.slice(0, 4).map((task)=>{
                                            const project = projects.find((p)=>p.id === task.projectId);
                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "list-item",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        style: {
                                                            fontSize: '1.1rem'
                                                        },
                                                        children: "🔄"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 196,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "list-item-content",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "list-item-title",
                                                                children: task.title
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 198,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "list-item-subtitle",
                                                                children: [
                                                                    project?.name,
                                                                    " · ",
                                                                    task.assignee || 'Otilldelad',
                                                                    task.dueDate && ` · ${formatDate(task.dueDate)}`
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 199,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 197,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "badge badge-accent",
                                                        children: "Pågår"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 204,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, task.id, true, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 195,
                                                columnNumber: 19
                                            }, this);
                                        })
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 191,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 187,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 104,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 62,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
_s(DashboardPage, "L+xcrUw+Ilhjq3Eht49i7CkPjaM=");
_c = DashboardPage;
var _c;
__turbopack_context__.k.register(_c, "DashboardPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__0j12w6b._.js.map