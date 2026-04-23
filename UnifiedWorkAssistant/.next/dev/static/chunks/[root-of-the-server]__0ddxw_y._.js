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
"[project]/src/app/meetings/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MeetingsPage
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
function MeetingsPage() {
    _s();
    const [meetings, setMeetings] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [projects, setProjects] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [showModal, setShowModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [form, setForm] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        title: '',
        projectId: '',
        scheduledAt: '',
        participants: ''
    });
    const [mounted, setMounted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MeetingsPage.useEffect": ()=>{
            setMeetings((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getMeetings"])());
            setProjects((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getProjects"])());
            setMounted(true);
        }
    }["MeetingsPage.useEffect"], []);
    const handleCreate = ()=>{
        if (!form.title.trim()) return;
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createMeeting"])({
            title: form.title,
            projectId: form.projectId,
            scheduledAt: form.scheduledAt || new Date().toISOString(),
            status: 'scheduled',
            participants: form.participants.split(',').map((p)=>p.trim()).filter(Boolean)
        });
        setMeetings((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getMeetings"])());
        setShowModal(false);
        setForm({
            title: '',
            projectId: '',
            scheduledAt: '',
            participants: ''
        });
    };
    if (!mounted) return null;
    const scheduled = meetings.filter((m)=>m.status === 'scheduled');
    const completed = meetings.filter((m)=>m.status === 'completed');
    const inProgress = meetings.filter((m)=>m.status === 'in_progress');
    const formatDateTime = (d)=>{
        if (!d) return '';
        return new Date(d).toLocaleDateString('sv-SE', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
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
                                children: "Möten"
                            }, void 0, false, {
                                fileName: "[project]/src/app/meetings/page.tsx",
                                lineNumber: 52,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "page-header-subtitle",
                                children: "Planera, transkribera och följ upp möten"
                            }, void 0, false, {
                                fileName: "[project]/src/app/meetings/page.tsx",
                                lineNumber: 53,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/meetings/page.tsx",
                        lineNumber: 51,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: 'flex',
                            gap: 'var(--space-sm)'
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                href: "/transcribe",
                                className: "btn btn-secondary",
                                children: "🎙️ Starta Live-transkribering"
                            }, void 0, false, {
                                fileName: "[project]/src/app/meetings/page.tsx",
                                lineNumber: 56,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "btn btn-primary",
                                onClick: ()=>setShowModal(true),
                                children: "+ Nytt Möte"
                            }, void 0, false, {
                                fileName: "[project]/src/app/meetings/page.tsx",
                                lineNumber: 57,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/meetings/page.tsx",
                        lineNumber: 55,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/meetings/page.tsx",
                lineNumber: 50,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "page-body",
                children: [
                    inProgress.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            marginBottom: 'var(--space-2xl)'
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                style: {
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    marginBottom: 'var(--space-md)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-sm)'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "rec-indicator"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/meetings/page.tsx",
                                        lineNumber: 66,
                                        columnNumber: 15
                                    }, this),
                                    " Pågående Möten"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/meetings/page.tsx",
                                lineNumber: 65,
                                columnNumber: 13
                            }, this),
                            inProgress.map((m)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    href: `/transcribe?meetingId=${m.id}`,
                                    className: "card",
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-md)',
                                        textDecoration: 'none',
                                        color: 'inherit',
                                        marginBottom: 'var(--space-md)',
                                        borderColor: 'var(--color-danger)',
                                        background: 'rgba(239,68,68,0.05)'
                                    },
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            style: {
                                                fontSize: '1.5rem'
                                            },
                                            children: "🎙️"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 70,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            style: {
                                                flex: 1
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    style: {
                                                        fontWeight: 600
                                                    },
                                                    children: m.title
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/meetings/page.tsx",
                                                    lineNumber: 72,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    style: {
                                                        fontSize: '0.8rem',
                                                        color: 'var(--text-tertiary)'
                                                    },
                                                    children: [
                                                        "Startad ",
                                                        formatDateTime(m.startedAt || '')
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/meetings/page.tsx",
                                                    lineNumber: 73,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 71,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "badge badge-danger",
                                            children: "● Live"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 75,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, m.id, true, {
                                    fileName: "[project]/src/app/meetings/page.tsx",
                                    lineNumber: 69,
                                    columnNumber: 15
                                }, this))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/meetings/page.tsx",
                        lineNumber: 64,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            marginBottom: 'var(--space-2xl)'
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                style: {
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    marginBottom: 'var(--space-md)',
                                    color: 'var(--text-secondary)'
                                },
                                children: [
                                    "📅 Kommande (",
                                    scheduled.length,
                                    ")"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/meetings/page.tsx",
                                lineNumber: 83,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card",
                                children: scheduled.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "empty-state",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "empty-state-icon",
                                            children: "📅"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 89,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                            children: "Inga kommande möten"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 90,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: "Skapa ett nytt möte eller starta en transkribering direkt."
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 91,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/meetings/page.tsx",
                                    lineNumber: 88,
                                    columnNumber: 15
                                }, this) : scheduled.map((meeting)=>{
                                    const project = projects.find((p)=>p.id === meeting.projectId);
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "list-item",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                style: {
                                                    fontSize: '1.3rem'
                                                },
                                                children: "📅"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/meetings/page.tsx",
                                                lineNumber: 97,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "list-item-content",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "list-item-title",
                                                        children: meeting.title
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/meetings/page.tsx",
                                                        lineNumber: 99,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "list-item-subtitle",
                                                        children: [
                                                            formatDateTime(meeting.scheduledAt),
                                                            project && ` · ${project.name}`,
                                                            meeting.participants.length > 0 && ` · ${meeting.participants.join(', ')}`
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/meetings/page.tsx",
                                                        lineNumber: 100,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/meetings/page.tsx",
                                                lineNumber: 98,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                style: {
                                                    display: 'flex',
                                                    gap: 'var(--space-sm)'
                                                },
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                    href: `/transcribe?meetingId=${meeting.id}`,
                                                    className: "btn btn-primary btn-sm",
                                                    children: "🎙️ Transkribera"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/meetings/page.tsx",
                                                    lineNumber: 107,
                                                    columnNumber: 21
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/meetings/page.tsx",
                                                lineNumber: 106,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, meeting.id, true, {
                                        fileName: "[project]/src/app/meetings/page.tsx",
                                        lineNumber: 96,
                                        columnNumber: 17
                                    }, this);
                                })
                            }, void 0, false, {
                                fileName: "[project]/src/app/meetings/page.tsx",
                                lineNumber: 86,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/meetings/page.tsx",
                        lineNumber: 82,
                        columnNumber: 9
                    }, this),
                    completed.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                style: {
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    marginBottom: 'var(--space-md)',
                                    color: 'var(--text-secondary)'
                                },
                                children: [
                                    "✅ Avslutade (",
                                    completed.length,
                                    ")"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/meetings/page.tsx",
                                lineNumber: 120,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "card",
                                children: completed.map((meeting)=>{
                                    const project = projects.find((p)=>p.id === meeting.projectId);
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "list-item",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                style: {
                                                    fontSize: '1.3rem'
                                                },
                                                children: "📋"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/meetings/page.tsx",
                                                lineNumber: 128,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "list-item-content",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "list-item-title",
                                                        children: meeting.title
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/meetings/page.tsx",
                                                        lineNumber: 130,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "list-item-subtitle",
                                                        children: [
                                                            formatDateTime(meeting.endedAt || meeting.scheduledAt),
                                                            project && ` · ${project.name}`,
                                                            meeting.transcript.length > 0 && ` · ${meeting.transcript.length} segment`
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/meetings/page.tsx",
                                                        lineNumber: 131,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/meetings/page.tsx",
                                                lineNumber: 129,
                                                columnNumber: 21
                                            }, this),
                                            meeting.summary && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "badge badge-success",
                                                children: "Sammanfattat"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/meetings/page.tsx",
                                                lineNumber: 137,
                                                columnNumber: 41
                                            }, this)
                                        ]
                                    }, meeting.id, true, {
                                        fileName: "[project]/src/app/meetings/page.tsx",
                                        lineNumber: 127,
                                        columnNumber: 19
                                    }, this);
                                })
                            }, void 0, false, {
                                fileName: "[project]/src/app/meetings/page.tsx",
                                lineNumber: 123,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/meetings/page.tsx",
                        lineNumber: 119,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/meetings/page.tsx",
                lineNumber: 61,
                columnNumber: 7
            }, this),
            showModal && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "modal-overlay",
                onClick: ()=>setShowModal(false),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "modal",
                    onClick: (e)=>e.stopPropagation(),
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "modal-header",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    children: "Nytt Möte"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/meetings/page.tsx",
                                    lineNumber: 151,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    className: "btn btn-ghost btn-icon",
                                    onClick: ()=>setShowModal(false),
                                    children: "✕"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/meetings/page.tsx",
                                    lineNumber: 152,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/meetings/page.tsx",
                            lineNumber: 150,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "modal-body",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "form-group",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "form-label",
                                            children: "Mötestitel"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 156,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            className: "input",
                                            placeholder: "T.ex. Sprint Planning Vecka 17",
                                            value: form.title,
                                            onChange: (e)=>setForm({
                                                    ...form,
                                                    title: e.target.value
                                                }),
                                            autoFocus: true
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 157,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/meetings/page.tsx",
                                    lineNumber: 155,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "form-group",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "form-label",
                                            children: "Projekt (valfritt)"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 160,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                            className: "input",
                                            value: form.projectId,
                                            onChange: (e)=>setForm({
                                                    ...form,
                                                    projectId: e.target.value
                                                }),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: "",
                                                    children: "Inget projekt"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/meetings/page.tsx",
                                                    lineNumber: 162,
                                                    columnNumber: 19
                                                }, this),
                                                projects.map((p)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                        value: p.id,
                                                        children: p.name
                                                    }, p.id, false, {
                                                        fileName: "[project]/src/app/meetings/page.tsx",
                                                        lineNumber: 163,
                                                        columnNumber: 38
                                                    }, this))
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 161,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/meetings/page.tsx",
                                    lineNumber: 159,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "form-group",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "form-label",
                                            children: "Tid"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 167,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            className: "input",
                                            type: "datetime-local",
                                            value: form.scheduledAt,
                                            onChange: (e)=>setForm({
                                                    ...form,
                                                    scheduledAt: e.target.value
                                                })
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 168,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/meetings/page.tsx",
                                    lineNumber: 166,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "form-group",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "form-label",
                                            children: "Deltagare (kommaseparerade)"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 171,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            className: "input",
                                            placeholder: "Anna, Erik, Maria",
                                            value: form.participants,
                                            onChange: (e)=>setForm({
                                                    ...form,
                                                    participants: e.target.value
                                                })
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/meetings/page.tsx",
                                            lineNumber: 172,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/meetings/page.tsx",
                                    lineNumber: 170,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/meetings/page.tsx",
                            lineNumber: 154,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "modal-footer",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    className: "btn btn-secondary",
                                    onClick: ()=>setShowModal(false),
                                    children: "Avbryt"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/meetings/page.tsx",
                                    lineNumber: 176,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    className: "btn btn-primary",
                                    onClick: handleCreate,
                                    children: "Skapa Möte"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/meetings/page.tsx",
                                    lineNumber: 177,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/meetings/page.tsx",
                            lineNumber: 175,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/meetings/page.tsx",
                    lineNumber: 149,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/meetings/page.tsx",
                lineNumber: 148,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true);
}
_s(MeetingsPage, "uyDqej6wdj6ccTwoeAR6OcNy1to=");
_c = MeetingsPage;
var _c;
__turbopack_context__.k.register(_c, "MeetingsPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__0ddxw_y._.js.map