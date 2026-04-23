const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { seedModelRegistry, seedDefaultAISettings, seedInitialAdmin } = require('./seed-ai');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString, max: 2 });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database with real Top of Minds consultants...');

  await prisma.notification.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.consultant.deleteMany();
  await prisma.client.deleteMany();

  // Create clients (sequential to avoid connection exhaustion on Cloud SQL micro)
  const clientData = [
    { name: 'ICA Sverige AB', orgNumber: '556021-0261', contactPerson: 'Maria Svensson', contactEmail: 'maria.svensson@ica.se', contactPhone: '+46 8 555 0101', address: 'Solna', notes: 'Långsiktigt samarbete inom Checkout och Customer Solutions.' },
    { name: 'Länsförsäkringar AB', orgNumber: '502010-9681', contactPerson: 'Karin Nilsson', contactEmail: 'karin.nilsson@lansforsakringar.se', contactPhone: '+46 8 555 0202', address: 'Stockholm', notes: 'Flera pågående uppdrag inom bank och försäkring.' },
    { name: 'Autoliv', orgNumber: '556547-4742', contactPerson: 'Erik Johansson', contactEmail: 'erik.johansson@autoliv.com', contactPhone: '+46 8 555 0303', address: 'Stockholm', notes: 'Globala IT-projekt inom Supply Chain Management och BI.' },
    { name: 'Vattenfall Eldistribution', orgNumber: '556417-0800', contactPerson: 'Anna Lindström', contactEmail: 'anna.lindstrom@vattenfall.com', contactPhone: '+46 8 555 0404', address: 'Stockholm', notes: 'Förändringsledning och organisationsutveckling.' },
    { name: 'IKEA AB', orgNumber: '556074-7569', contactPerson: 'Lisa Berg', contactEmail: 'lisa.berg@ikea.com', contactPhone: '+46 42 555 0505', address: 'Älmhult', notes: 'CRM-implementationer med MS Dynamics 365.' },
    { name: 'SJ AB', orgNumber: '556196-1599', contactPerson: 'Peter Holm', contactEmail: 'peter.holm@sj.se', contactPhone: '+46 10 555 0606', address: 'Stockholm' },
    { name: 'Region Stockholm', orgNumber: '232100-0016', contactPerson: 'Sara Ek', contactEmail: 'sara.ek@regionstockholm.se', contactPhone: '+46 8 555 0707', address: 'Stockholm' },
    { name: 'Telia Company / TV4 Media', orgNumber: '556103-4249', contactPerson: 'Magnus Eriksson', contactEmail: 'magnus.eriksson@telia.se', contactPhone: '+46 10 555 0808', address: 'Stockholm' },
  ];
  const clients = [];
  for (const d of clientData) {
    clients.push(await prisma.client.create({ data: d }));
  }

  // =============================================
  // REAL CONSULTANTS — Top of Minds
  // =============================================

  const consultantDataList = [
    // 0: Connie Nordahl — Team Accelerate
    {
      firstName: 'Connie', lastName: 'Nordahl',
      email: 'connie.nordahl@topofminds.se',
      phone: '+46 73 427 42 87',
      title: 'Senior Projekt- & Förändringsledare',
      team: 'Drive',
      skills: JSON.stringify(['Projektledning', 'Förändringsledning', 'Införandeplanering', 'Produktägarskap', 'Digitala transformationer', 'Kravledning', 'SAFe RTE', 'Stakeholder Management']),
      status: 'ON_CONTRACT',
      hourlyRate: 1300,
      bio: 'Connie är en senior projekt- och förändringsledare med stor erfarenhet av att driva storskaliga, affärskritiska transformationer inom detaljhandel, finans och försäkring. Hon har lett komplexa initiativ med flera parallella projekt och stor påverkan på den operativa verksamheten. Kollegor beskriver Connie som en förtroendeingivande och jordnära ledare med ett tydligt och strukturerat arbetssätt, starkt leveransfokus och mycket god samarbetsförmåga.',
      education: JSON.stringify([
        'Bachelor of IT (e-commerce), Queensland University of Technology (2002)',
        'IT Kandidat, Norges Informasjonsteknologiske Høyskole (2001)'
      ]),
      experience: JSON.stringify([
        { customer: 'ICA Sverige AB', role: 'Projektledare | Produktägare | Förändringsledare', period: '2021 – Pågående', description: 'Långsiktigt konsultuppdrag hos ICA med flera centrala roller inom Customer Solutions och Retail Solutions. Arbetade med verksamhetsnära projekt riktade mot slutkund och butik. Ledde bl.a. Checkout-teamet med ny kassaplattform, förändringsledning, produktägarskap för självscanning, och projektledning för Mobil Självscanning.' },
        { customer: 'Länsförsäkringar AB', role: 'Produktägare & Projektledare', period: '2018 – 2020', description: 'Produktägare för "Mina sidor" med ansvar för backlogg och prioritering. Team ~30 personer. Även projektledare för Lokal Märkesförsäkring (LMF) — ett av LFABs tre högst prioriterade projekt 2018/2019.' },
        { customer: 'ICA Sverige AB', role: 'Product Lead & Business Analyst', period: '2015 – 2018', description: 'Marketing Automation Transformation (KL2020), Förenklad lojalitet, CRM-integration för ICA och Apotek Hjärtat.' },
        { customer: 'Nordea', role: 'Kravanalytiker', period: '2013 – 2014', description: 'Kravanalytiker för FATCA-projektet.' },
        { customer: 'Skatteverket', role: 'Kravanalytiker', period: '2011 – 2012', description: 'Kravanalytiker för TINA-projektet.' }
      ]),
      certifications: JSON.stringify([
        { name: 'Certifierad SAFe RTE 5.0', year: '2020' },
        { name: 'Certifierad SAFe RTE 4.0', year: '2019' },
        { name: 'ELM, Ensemble Logical Modeling', year: '2020' },
        { name: 'IREB certifierad kravhanterare', year: '2017' },
        { name: 'Att leda utan att vara chef', year: '2022' }
      ]),
      languages: JSON.stringify([
        { language: 'Svenska', level: 'native' },
        { language: 'Norska', level: 'native' },
        { language: 'Engelska', level: 'fluent' }
      ]),
      employmentHistory: JSON.stringify([
        { company: 'Top of Minds AB', period: '2019 – Nuvarande', role: 'Managementkonsult' },
        { company: 'Capgemini', period: '2013 – 2019', role: 'Konsult' },
        { company: 'IBX Group AB / Nicator Group', period: '2004 – 2012', role: 'Projektledare / Kravanalytiker' }
      ]),
      industryExpertise: JSON.stringify(['Detaljhandel', 'E-handel', 'IT', 'Bank', 'Försäkring', 'Offentlig sektor']),
      nationality: 'Svensk + Norsk',
      address: 'Biblioteksgatan 29, 114 35 Stockholm',
      linkedin: 'https://linkedin.com/in/connienordahl',
    },

    // 1: Gustav Westergren — Team Drive
    {
      firstName: 'Gustav', lastName: 'Westergren',
      email: 'gustav.westergren@topofminds.se',
      phone: '+46 70 727 04 58',
      title: 'Product Manager & Agile Coach',
      team: 'Drive',
      skills: JSON.stringify(['Product Management', 'Agile Coach', 'Projektledning', 'Data Management', 'Business Intelligence', 'Scrum', 'SAFe', 'Stakeholder Management', 'Cloud Migration']),
      status: 'ON_CONTRACT',
      hourlyRate: 1250,
      bio: 'Gustav is an IT-consultant with experience within a wide range of projects, often in the role as project or product manager, coordinator and communicator. Projects range from building a social network from scratch, acquisitions, rolling out new services to global markets, and managing critical systems within finance. His good sense of prioritization, decision making, identifying risks and communicational abilities always served him and the projects well.',
      education: JSON.stringify([
        'IHM Business School - Project Management, Leadership and Group Dynamics (2014)',
        'Hawaii Pacific University - Marketing, Economics and Organizational Development (2004-2005)',
        'Kungliga Tekniska Högskolan - Industrial Economics and Production (2003-2007)'
      ]),
      experience: JSON.stringify([
        { customer: 'Autoliv', role: 'Development Lead / Product Management – Data Management & BI', period: '2021 – Pågående', description: 'Led architecture board, coordinated sprints, oversaw integrations and reports. Project Manager for cloud migration to Snowflake. Implemented Data Mesh Architecture within global BI team. Managed 3-4 development teams.' },
        { customer: 'Länsförsäkringar Bank', role: 'Product Manager – Bank Retail/AML', period: '2020', description: 'Ansvarig för stabil utveckling och drift av bankens mest affärskritiska system. AML-system för transaktionsövervakning, riskbedömning och KYC. Ansvarig för servermigrationsprojekt.' },
        { customer: 'Länsförsäkringar (LFAB)', role: 'Product Management – Mina sidor', period: '2018 – 2019', description: 'Ansvarig för roadmap, utveckling och drift av huvudapplikationen för kundinteraktioner inom finans, försäkring och pension.' },
        { customer: 'Comprend', role: 'Project Manager / Technical Lead', period: '2017 – 2018', description: 'Projektledning av SaaS-implementationer. Teknisk lead under säljprocessen med lösningsförslag, TCO-beräkningar och kundvärde.' },
        { customer: 'LocalLife', role: 'Product Manager / Agile Coach', period: '2015 – 2017', description: 'Utveckling av social nätverksapplikation. Försäljning av koncept till kommuner och fastighetsbolag. 10 MSEK i resurser.' },
        { customer: 'Ericsson AB', role: 'Cost Reduction Manager', period: '2013 – 2014', description: 'Kostnadsreduktionsprogram som genererade ~45 MSEK/år. Utrullning av Microsoft 365 globalt.' }
      ]),
      certifications: JSON.stringify([
        { name: 'Certified Release Train Engineer, SAFe', year: '2019' },
        { name: 'PMI – Project Management Professional (PMP)', year: '2018' },
        { name: 'PMI Agile Certified Practitioner (ACP)', year: '2018' },
        { name: 'Certified Scrum Manager (Henrik Kniberg)', year: '2018' },
        { name: 'Certified Leading and Implementing SAFe', year: '2018' }
      ]),
      languages: JSON.stringify([
        { language: 'Svenska', level: 'native' },
        { language: 'Engelska', level: 'fluent' }
      ]),
      employmentHistory: JSON.stringify([
        { company: 'Top of Minds Drive AB', period: '2019 – Nuvarande', role: 'Managementkonsult' },
        { company: 'Comprend', period: '2017 – 2018', role: 'Technical Lead / Project Manager' },
        { company: 'LocalLife', period: '2015 – 2017', role: 'Product Manager' },
        { company: 'Ericsson AB', period: '2013 – 2014', role: 'Change Manager' },
        { company: 'Match.com', period: '2006 – 2012', role: 'Technical Support' }
      ]),
      industryExpertise: JSON.stringify(['IT', 'Bank & Försäkring', 'Fastigheter', 'Transport', 'Detaljhandel', 'E-handel']),
      nationality: 'Svensk',
      address: 'Biblioteksgatan 29, 114 35 Stockholm',
      linkedin: 'https://linkedin.com/in/gustavwestergren',
    },

    // 2: Jeff Råsten — Team Accelerate
    {
      firstName: 'Jeff', lastName: 'Råsten',
      email: 'jeff.rasten@topofminds.se',
      phone: '+46 70 880 06 79',
      title: 'Projektledare',
      team: 'Drive',
      skills: JSON.stringify(['Projektledning', 'Produktägarskap', 'Scrum Master', 'SAFe', 'Kravställning', 'Coaching', 'MS Dynamics 365', 'Azure DevOps', 'JIRA']),
      status: 'ON_CONTRACT',
      hourlyRate: 1150,
      bio: 'Jeff är en uppskattad och senior Projektledare med bred kompetens inom agila utvecklingsmetoder och komplexa IT-leveranser. Han har framgångsrikt lett projekt inom bank, försäkring, IT, e-handel och detaljhandel. Jeff utmärker sig genom sin transparenta och kommunikativa ledarstil som skapar förtroende och engagemang. Han har alltid ambitionen att bygga upp högpresterande team för att möta leveransmål.',
      education: JSON.stringify([
        'Masterexamen i IT-Management (2015-2016)',
        'Kandidatexamen i Företagsekonomi (2012-2015)'
      ]),
      experience: JSON.stringify([
        { customer: 'Länsförsäkringar AB', role: 'Projektledare / Scrum Master / Produktägare', period: '2022 – Pågående', description: 'Leder och utvecklar kundupplevelsen för flera försäkringsprodukter. Förbättrar arbetsprocesser, prioriterar backlogg, detaljerar krav. Del av SAFe-organisation.' },
        { customer: 'IKEA AB', role: 'Projektledare', period: '2019 – 2022', description: 'Ledde implementationer av MS Dynamics 365 över flera avdelningar. CRM för köksavdelningar, B2B-lösningar och interna bokningssystem. Tre stora projekt med helhetsansvar.' },
        { customer: 'Svenska Fotbollsförbundet / Malmö Redhawks', role: 'Projektledare', period: '2018 – 2020', description: 'Implementation av sporthanteringssystemet SAP Sports One.' },
        { customer: 'Codan Försäkring / Trygghansa', role: 'Projektledare', period: '2017 – 2018', description: 'Plattformsmigration med fokus på koordinering av releaseprocessen. Stationerad i Köpenhamn.' }
      ]),
      certifications: JSON.stringify([
        { name: 'SAFe Product Owner/Product Manager', year: '2024' },
        { name: 'Leading SAFe® 5.1', year: '2022' },
        { name: 'SAFe Scrum Master', year: '2021' }
      ]),
      languages: JSON.stringify([
        { language: 'Svenska', level: 'native' },
        { language: 'Engelska', level: 'fluent' }
      ]),
      employmentHistory: JSON.stringify([
        { company: 'Top of Minds AB', period: '2022 – Nuvarande', role: 'Managementkonsult' },
        { company: 'Capgemini Sverige AB', period: '2017 – 2022', role: 'Projektledare' },
        { company: 'Försvarsmakten', period: '2010', role: 'Insatssoldat / Gruppchef' }
      ]),
      industryExpertise: JSON.stringify(['IT', 'Försäkring', 'E-handel', 'Detaljhandel', 'Sport']),
      nationality: 'Svensk',
      address: 'Biblioteksgatan 29, 114 35 Stockholm',
      linkedin: 'https://linkedin.com/in/jeffrasten',
    },

    // 3: Johan Flink — Team Steam
    {
      firstName: 'Johan', lastName: 'Flink',
      email: 'johan.flink@topofminds.se',
      phone: '+46 70 921 81 33',
      title: 'Senior Konsult / Projektledare',
      team: 'Drive',
      skills: JSON.stringify(['Senior Ledarskap', 'Verksamhetsutveckling', 'Produktutveckling', 'Systemintegration', 'ERP/EPM-lösningar', 'Kravanalys', 'MS Azure', 'Power BI', 'MS DevOps']),
      status: 'AVAILABLE',
      hourlyRate: 1200,
      wantsNewAssignment: true,
      bio: 'Johan är en erfaren ledare och konsult med en bred erfarenhetsbas från både teknik- och management-området. Han har bland annat varit med och drivit upp teknikbolag (TeleOpti), arbetat som utvecklingschef på ProOpti samt gjort spännande uppdrag inom olika branscher. Johans tekniska bakgrund, strategiska tänkande och djupa förståelse för IT bäddar för sunda prioriteringar ur såväl strategiskt, ekonomiskt som tekniskt perspektiv.',
      education: JSON.stringify([
        'Civilingenjör, Maskinteknik (produktutveckling), KTH (2000)',
        'Marinens Krigshögskola, Reservofficer (Kapten) (1994)'
      ]),
      experience: JSON.stringify([
        { customer: 'Fora', role: 'Projektledare och EPM-konsult', period: 'Senaste', description: 'Implementation och integration mot nytt ekonomisystem samt migrering till MS Azure Cloud.' },
        { customer: 'Skatteverket', role: 'Senior Projektledare', period: 'Tidigare', description: 'Införande av rapporterings- och debiteringssystem fullt integrerat med HR och ERP-system.' },
        { customer: 'ProOpti', role: 'Partnercertifiering & Försäljning', period: 'Tidigare', description: 'Ansvarig för certifieringsprocesser mot Ericsson, Mitel, Cisco, Siemens, Avaya, NEC, Huawei. Due Diligence vid försäljning av bolaget.' },
        { customer: 'Kommuner & Landsting', role: 'Senior Projektledare', period: 'Tidigare', description: 'Införande av rapporterings- och debiteringssystem integrerat med HR och ERP.' },
        { customer: 'Ericsson (globalt)', role: 'Projektledare / Partneransvarig', period: 'Tidigare', description: 'Utrullning av TEM-lösning globalt – 17000 users i 30+ länder med integrationer (HR/SAP/televäxlar/mobiloperatörer).' }
      ]),
      certifications: JSON.stringify([]),
      languages: JSON.stringify([
        { language: 'Svenska', level: 'native' },
        { language: 'Engelska', level: 'fluent' }
      ]),
      employmentHistory: JSON.stringify([
        { company: 'Top of Minds AB', period: 'Nuvarande', role: 'Senior Konsult' },
        { company: 'ProOpti Sweden AB', period: 'Tidigare', role: 'Utvecklingschef' },
        { company: 'TeleOpti', period: 'Tidigare', role: 'Medgründare / Teknikchef' }
      ]),
      industryExpertise: JSON.stringify(['IT', 'Telekom', 'Offentlig sektor', 'Finans']),
      nationality: 'Svensk',
      address: 'Biblioteksgatan 29, 114 35 Stockholm',
      linkedin: 'https://linkedin.com/in/johanflink',
    },

    // 4: Jon Skärlina — Team Drive
    {
      firstName: 'Jon', lastName: 'Skärlina',
      email: 'jon.skarlina@topofminds.se',
      phone: '+46 70 252 23 27',
      title: 'Projektledare',
      team: 'Drive',
      skills: JSON.stringify(['Projektledning', 'Lifecycle Management', 'Kravhantering', 'Systemutveckling', 'Business Intelligence', 'Data Management', 'Test & Verifiering', 'Scrum', 'SAFe', 'JIRA', 'Confluence']),
      status: 'ON_CONTRACT',
      hourlyRate: 1200,
      bio: 'Jon har varit ansvarig för flertalet stora projekt inom energi-, bilsäkerhet-, fastighets- och finanssektorn. Han är en projektledare med stor förmåga att driva problem framåt på ett strukturerat, kommunikativt sätt med en positiv anda. Jon har bred kunskap och erfarenhet i byggandet av affärsrelationer, konkurrenskraftiga lösningar och högpresterande team. Oavsett projektets komplexitet säkrar Jon framdrift genom ansvarstagande och öppet sinne.',
      education: JSON.stringify([
        'Maskiningenjör – Civilingenjörsprogrammet, Lund (2006-2008)',
        'Maskiningenjör – Högskoleingenjör, Linköping (2003-2006)',
        'Kompanibefälsutbildning, LV7 Boden (2002-2003)',
        'Accelerated Learning Program C# and .NET, Academic Work (2016)'
      ]),
      experience: JSON.stringify([
        { customer: 'Vattenfall Eldistribution', role: 'Projektledare / Verksamhetsutvecklare', period: '2022 – Pågående', description: 'Förändringsledningsprojekt för att synliggöra genomförbarhetsförmågan inom investeringsportföljen.' },
        { customer: 'Autoliv', role: 'Projektledare', period: '2019 – 2022', description: 'Globala IT-projekt inom Supply Chain Management. Utveckling av prisändringsverktyg, cloud-baserad leverantörsportal, och implementering av intern KPI-rapportering med OBIEE.' },
        { customer: 'Swedbank', role: 'Utvecklare / Kravställare', period: '2016 – 2019', description: 'Drift, underhåll och utveckling inom Data Warehouse för LC&I-avdelningen. Treasury-rapportering, GSIB-rapportering, LoanIQ-integration. Migration från Kondor+ till Calypso.' },
        { customer: 'Allianz Capital Partners', role: 'Projektledare', period: '2014 – 2015', description: 'Försäljning av Järvsö Sörby vindkraftspark (122 MW, ~1500 MSEK).' },
        { customer: 'Element Power / Kraftö', role: 'Projektledare', period: '2012 – 2015', description: 'Projektutveckling av vindkraftparker, miljötillståndsansökningar, budget 5-10 MSEK.' }
      ]),
      certifications: JSON.stringify([
        { name: 'Certified SAFe 5 Agilist', year: '2020' },
        { name: 'Certified Scrum Master (PSM I)', year: '2016' },
        { name: 'Project Management', year: '2016' }
      ]),
      languages: JSON.stringify([
        { language: 'Svenska', level: 'native' },
        { language: 'Engelska', level: 'fluent' }
      ]),
      employmentHistory: JSON.stringify([
        { company: 'Top of Minds Drive AB', period: '2019 – Nuvarande', role: 'Managementkonsult' },
        { company: 'Nordicstation', period: '2017 – 2019', role: 'Konsult' },
        { company: 'Kraftö AB', period: '2012 – 2015', role: 'Projektledare' },
        { company: 'Schneider Electric AB', period: '2008 – 2012', role: 'Project Manager Trainee' }
      ]),
      industryExpertise: JSON.stringify(['IT', 'Energi', 'Finans', 'Fastigheter', 'Supply Chain Management']),
      nationality: 'Svensk',
      address: 'Biblioteksgatan 29, 114 35 Stockholm',
      linkedin: 'https://linkedin.com/in/jonskarlina',
    },

    // 5: Linn Holm — Team Accelerate
    {
      firstName: 'Linn', lastName: 'Holm',
      email: 'linn.holm@topofminds.se',
      phone: '+46 76 101 57 92',
      title: 'Produktägare & Kravanalytiker',
      team: 'Drive',
      skills: JSON.stringify(['Produktägarskap', 'Kravhantering', 'Projektledning', 'Agila metoder (SAFe)', 'Scrum Master', 'Testledning', 'Python', 'BNPL/Betallösningar']),
      status: 'AVAILABLE',
      hourlyRate: 1100,
      wantsNewAssignment: true,
      bio: 'Linn har bred expertis inom produktutveckling, tack vare sin varierande bakgrund – allt från kravhantering och utvecklare till testledare, projektledare och produktägare. Med sin tekniska bakgrund har Linn visat förmågan att navigera i nya tekniska landskap och samarbeta med en mängd olika intressenter. En betrodd ledare känd för sitt tydliga fokus, engagemang och förmåga att stärka team genom öppen och transparent kommunikation.',
      education: JSON.stringify([
        'Kandidatexamen Informationssystem, Uppsala universitet (2014-2017)',
        'Managementkurser, University of Tasmania (2017-2018)',
        'Economics & Entrepreneurship, PUCRS University Brazil (2016)'
      ]),
      experience: JSON.stringify([
        { customer: 'NTM AB', role: 'Produktägare', period: '2024', description: 'Produktägare för Core-teamet med ansvar för backend-utveckling. Etablerade prioriteringsstruktur, teamvision och förbättrad kommunikation med intressenter.' },
        { customer: 'SJ AB', role: 'Produktägare & Kravanalytiker', period: '2022 – 2023', description: 'Ansvarig för After Sales-området kopplat till SJs webb och app. Ledde plattformsmigrering, backlogprioritering och programsamordning. Deltog i SAFe-transformation.' },
        { customer: 'H&M Group', role: 'Systemägare & Scrum Master', period: '2021 – 2022', description: 'Systemägare för bedrägeriförebyggande system inom betalningsområdet. Scrum Master i SAFe-miljö.' },
        { customer: 'H&M Group', role: 'Applikationsexpert & Testledare', period: '2019 – 2021', description: 'BNPL-integration med Klarna – 15 marknadslanseringar. Testledning och utbildningsansvar.' },
        { customer: 'Länsförsäkringar Bank AB', role: 'Projektledare & Scrum Master', period: '2018', description: 'Transformationsprojekt inom datalager och BI. Förberedelse för ISO 9001 och ISO 27001.' },
        { customer: 'Svenska Handelsbanken', role: 'Python-utvecklare', period: '2016 – 2017', description: 'Utvecklare på bankens tradingsystem Front Arena Prime.' }
      ]),
      certifications: JSON.stringify([
        { name: 'ITIL Foundation', year: '2018' },
        { name: 'ISTQB Foundation', year: '2018' },
        { name: 'IREB CPRE Foundation', year: '2018' }
      ]),
      languages: JSON.stringify([
        { language: 'Svenska', level: 'native' },
        { language: 'Engelska', level: 'fluent' }
      ]),
      employmentHistory: JSON.stringify([
        { company: 'Top of Minds AB', period: '2023 – Nuvarande', role: 'Managementkonsult' },
        { company: 'CGI', period: '2018 – 2023', role: 'Konsult' },
        { company: 'Svenska Handelsbanken', period: '2013 – 2017', role: 'IT Trainee / Utvecklare' }
      ]),
      industryExpertise: JSON.stringify(['Bank', 'Betallösningar', 'Transport & Järnväg', 'E-handel', 'Media']),
      nationality: 'Svensk',
      address: 'Biblioteksgatan 29, 114 35 Stockholm',
      linkedin: 'https://linkedin.com/in/linnholm',
    },

    // 6: Linn St Cyr — Team Accelerate
    {
      firstName: 'Linn', lastName: 'St Cyr',
      email: 'linn.stcyr@topofminds.se',
      phone: '+46 73 051 36 13',
      title: 'Product Manager / Kravledare',
      team: 'Drive',
      skills: JSON.stringify(['Kravhantering', 'Projektledning', 'Digitala transformationer', 'Kundupplevelse', 'Affärsutveckling', 'SAFe', 'Agile Coach', 'CX-strategi', 'Design Thinking']),
      status: 'ON_CONTRACT',
      hourlyRate: 1250,
      bio: 'Linn bidrar med över åtta års erfarenhet av digitala transformationer, kravhantering och agilt ledarskap. Hon har gedigen erfarenhet av att leda förstudier och axla roller som Product Manager, Produktägare och Kravledare. Med sin starka kommunikativa förmåga fungerar Linn som en effektiv brygga mellan IT och verksamhet. Hon är lösningsorienterad, strukturerad och bidrar med energi och framdrift även i föränderliga och komplexa miljöer.',
      education: JSON.stringify([
        'Kandidatexamen i Service Management, Lunds universitet (2014-2017)'
      ]),
      experience: JSON.stringify([
        { customer: 'Region Stockholm', role: 'Krav- och projektledare', period: '2025 – Pågående', description: 'Modernisering av dataplattform. Översätter verksamhetsbehov till funktionella krav genom intervjuer och workshops. Driver processförbättringar och kommunikationsstrategier.' },
        { customer: 'Nordisk teleoperatör', role: 'CX-strateg', period: '2022 – 2025 (Accenture)', description: 'Strategisk målbild och kundupplevelsestrategi baserad på design thinking. Prioriterad roadmap med business case.' },
        { customer: 'Globalt bilföretag', role: 'Förmågekartläggare', period: '2022 – 2025 (Accenture)', description: 'Strategisk gap-analys för fem bilvarumärken för ökad digital försäljning.' },
        { customer: 'Nordiskt Telecombolag', role: 'Agil Coach & Team Lead', period: '2022 – 2025 (Accenture)', description: 'SAFe-transformation – coachade team och produktägare. Strategiska roadmaps och ökad effektivitet.' },
        { customer: 'Galatea', role: 'Produktägare – Digital transformation', period: '2020 – 2022', description: 'Digital strategi och B2B-e-handelsplattform. 80% kortare onboardingtid. E-handelsandel från 0 till 45% på ett år.' },
        { customer: 'Global modekedja', role: 'Projektledare – E-handelsexpansion', period: '2017 – 2020 (Accenture)', description: 'Lansering av betalningsalternativ i 15+ marknader med lokal anpassning.' }
      ]),
      certifications: JSON.stringify([
        { name: 'SAFe® 6 - Advanced Scrum Master', year: '2023' },
        { name: 'Leading SAFe® 6', year: '2023' }
      ]),
      languages: JSON.stringify([
        { language: 'Svenska', level: 'native' },
        { language: 'Engelska', level: 'fluent' }
      ]),
      employmentHistory: JSON.stringify([
        { company: 'Top of Minds AB', period: '2025 – Nuvarande', role: 'Managementkonsult' },
        { company: 'Accenture', period: '2017 – 2025', role: 'Managementkonsult' },
        { company: 'Galatea', period: '2020 – 2022', role: 'Produktägare' }
      ]),
      industryExpertise: JSON.stringify(['IT', 'E-handel', 'Detaljhandel', 'Fordonsindustri', 'Telekom', 'Offentlig sektor']),
      nationality: 'Svensk',
      address: 'Biblioteksgatan 29, 114 35 Stockholm',
      linkedin: 'https://linkedin.com/in/linnstcyr',
    },

    // 7: Malin Stross — Team Drive
    {
      firstName: 'Malin', lastName: 'Stross',
      email: 'malin.stross@topofminds.se',
      phone: '+46 70 466 96 81',
      title: 'Senior Projekt- & Förändringsledare',
      team: 'Drive',
      skills: JSON.stringify(['Projektledning', 'Programledning', 'Förändringsledning', 'Affärsutveckling', 'Ledarskap', 'E-handel', 'Digital transformation', 'SAFe', 'PPS', 'Stakeholder Management']),
      status: 'ON_CONTRACT',
      hourlyRate: 1350,
      bio: 'Malin är en senior projektledare med lång erfarenhet av att driva både tekniska och verksamhetsnära projekt. Hon har arbetat i komplexa organisationer med ansvar för planering, genomförande och leverans. Malin har lett utvecklings- och implementationsprojekt i internationella miljöer och varit del av att bygga upp ett SaaS-bolag från insidan. Som ledare är hon engagerande, lösningsorienterad och trygg i att ta ansvar för helheten.',
      education: JSON.stringify([
        'BSc Business IT & Marketing, London Guildhall University (1996-1999)'
      ]),
      experience: JSON.stringify([
        { customer: 'Vattenfall', role: 'Förändringsledare', period: '2024 – 2025', description: 'Stöttade Director of External Workforce. Definierade styrning och rollstrukturer. Ledde tvärfunktionellt initiativ för anpassning till ny lagstiftning. Centre of Excellence-ramverk.' },
        { customer: 'Telenor', role: 'Manager Continuous Improvements', period: '2023', description: 'Rapporterade till CIO. Intern kommunikation, IT Playbook, konferensarrangemang. Förändringsledning.' },
        { customer: 'Pensionsmyndigheten', role: 'Projektledare', period: '2022', description: 'Strategiprocess för Kommunikationsavdelningen. Nulägesanalys och förmågekartläggning med minPension.' },
        { customer: 'SOS Alarm', role: 'Programledare', period: '2020 – 2021', description: 'Programledare för SOS Alarms digitala transformation. Största initiativet i företagets historia – 100+ personer, 8 delprojekt. PPS-modell.' },
        { customer: 'TUI Group / TUI Nordic', role: 'Nordic Transformation Lead / Head of Inflight Retail', period: '2016 – 2020', description: 'Nyckelperson i TUIs globala plattformsförflyttning (200+ personer). Head of Inflight Retail eCommerce – internationellt projekt med 200 MSEK budget. CRM & Data Analytics styrgrupp.' },
        { customer: 'The Walt Disney Company', role: 'Projektledare', period: '2013 – 2015', description: 'Lansering av Disney Store Online i Norden.' },
        { customer: 'Nikon Europe B.V.', role: 'Projektledare', period: '2007 – 2013', description: 'E-handelsexpansion B2B/B2C till 25000 återförsäljare i 21 länder.' }
      ]),
      certifications: JSON.stringify([
        { name: 'Leading SAFe', year: '2024' },
        { name: 'ELM – Ensemble Logical Modeling', year: '2024' },
        { name: 'Certified Scrum Master', year: '2009' }
      ]),
      languages: JSON.stringify([
        { language: 'Svenska', level: 'native' },
        { language: 'Engelska', level: 'fluent' },
        { language: 'Tyska', level: 'basic' }
      ]),
      employmentHistory: JSON.stringify([
        { company: 'Top of Minds AB', period: '2024 – Nuvarande', role: 'Managementkonsult' },
        { company: 'Purply AB', period: '2020 – 2024', role: 'Managementkonsult & Ledningsgrupp' },
        { company: 'TUI Group', period: '2016 – 2020', role: 'Nordic Transformation Lead' },
        { company: 'The Walt Disney Company', period: '2013 – 2015', role: 'Projektledare' },
        { company: 'Nikon Europe B.V.', period: '2007 – 2013', role: 'Projektledare' }
      ]),
      industryExpertise: JSON.stringify(['Bank & Finans', 'Retail & E-handel', 'Telekom', 'Myndighet', 'Turism', 'Transport']),
      nationality: 'Svensk',
      address: 'Biblioteksgatan 29, 114 35 Stockholm',
      linkedin: 'https://linkedin.com/in/malinstross',
    },

    // 8: Stefan Tägt — Team Steam
    {
      firstName: 'Stefan', lastName: 'Tägt',
      email: 'stefan.tagt@topofminds.se',
      phone: '+46 76 444 48 63',
      title: 'Release Train Engineer / Produktägare / Projektledare',
      team: 'Drive',
      skills: JSON.stringify(['Agilt ledarskap (RTE/SM)', 'SAFe', 'Produktägarskap', 'Projektledning', 'Krav- & processutveckling', 'CRM (Lime)', 'Azure DevOps', 'Jira', 'PPS', 'Power BI']),
      status: 'ON_CONTRACT',
      hourlyRate: 1200,
      bio: 'Stefan är en erfaren Projektledare, Produktägare, Release Train Engineer, Scrum Master, Delivery Manager och CRM-expert med närmare 20 års erfarenhet av affärskritiska IT-system. Han har lett tvärfunktionella team inom mjukvaru- och affärsutveckling. Hans strukturerade arbetssätt, goda kommunikativa förmåga och förmåga att stödja organisationer i förändring gör honom till en stabil och lösningsorienterad ledare. Han uppskattas för sitt engagemang, samarbetsförmåga och positiva energi.',
      education: JSON.stringify([
        'Civilekonom/Magisterexamen, Management & IT, Södertörns Högskola & KTH (2003-2007)'
      ]),
      experience: JSON.stringify([
        { customer: 'Länsförsäkringar Bank', role: 'Release Train Engineer & Scrum Master', period: '2024 – 2026', description: 'RTE och SM för bankens analysplattform (IPA). Ledde utvecklingståg, koordinerade beroenden, faciliterade SAFe-ceremonier. Vidareutveckling av plattformen, migration av BankDW, Oracle-uppgradering. Budget, KPI-uppföljning och Azure DevOps.' },
        { customer: 'Telia Company / TV4 Media', role: 'Projektledare & Produktägare', period: '2021 – 2024', description: 'Ersättning av betallösning, produktägarskap för abonnemangshantering (Singula), betaltjänster (Nets, Klarna) och utskick (Adobe Campaign). Migration av C More-abonnenter till TV4 Play.' },
        { customer: 'Apoteket Farmaci AB (via Lime)', role: 'Projektledare', period: 'Tidigare', description: 'Implementation av nytt CRM-system inklusive datamigrering, kravinsamling och utbildning.' },
        { customer: 'Babs Paylink AB (via Lime)', role: 'Projektledare', period: 'Tidigare', description: 'Införsäljning, leveransprojekt, nytt affärssystem, integrationer mot ERP.' },
        { customer: 'Savills Sweden AB (via Lime)', role: 'Projektledare / Förvaltningsledare', period: 'Tidigare', description: 'CRM för kontakt- och affärsstrukturhantering, rapportering och analys.' }
      ]),
      certifications: JSON.stringify([
        { name: 'Certified SAFe® 5 Agilist', year: '' },
        { name: 'Certified SAFe® 5 Product Owner/Product Manager', year: '' },
        { name: 'Practical Project Steering (PPS), TietoEvry', year: '' },
        { name: 'Prince2, Arkatay', year: '' },
        { name: 'Growth Mindset, Dale Carnegie', year: '' }
      ]),
      languages: JSON.stringify([
        { language: 'Svenska', level: 'native' },
        { language: 'Engelska', level: 'fluent' },
        { language: 'Tyska', level: 'basic' }
      ]),
      employmentHistory: JSON.stringify([
        { company: 'Top of Minds AB', period: '2024 – Nuvarande', role: 'Managementkonsult' },
        { company: 'Lime Technologies AB', period: '2007 – 2021', role: 'CRM-konsult / Delivery Manager' }
      ]),
      industryExpertise: JSON.stringify(['Bank & Finans', 'Betallösningar', 'Media & Streaming', 'E-handel & Retail', 'Fastighet', 'Offentlig sektor']),
      nationality: 'Svensk',
      address: 'Biblioteksgatan 29, 114 35 Stockholm',
      linkedin: 'https://linkedin.com/in/stefantagt',
    },

    // 9: Ulrik Lind — Team Drive
    {
      firstName: 'Ulrik', lastName: 'Lind',
      email: 'ulrik.lind@topofminds.se',
      phone: '+46 76 706 68 57',
      title: 'Senior Konsult / Lösningsarkitekt',
      team: 'Drive',
      skills: JSON.stringify(['Project Management', 'Architecture & Solution Design', 'Cloud Solutions (AWS)', 'IT Infrastructure Design', 'Requirements Management', 'IT Lifecycle Management', 'Content Delivery Networks', 'Digital TV & Streaming', 'C++', 'Python']),
      status: 'AVAILABLE',
      hourlyRate: 1400,
      wantsNewAssignment: true,
      bio: 'Ulrik is a senior business-driven consultant and technical leader with 20+ years of experience from Telecom, TV & Media, and Oil & Gas industries. He has vast knowledge in requirement handling and investigation of major solutions with subsequent design, specification, planning, integration, project delivery, operation and maintenance. Ulrik has more than ten years of international experience as an expatriate. He is driven by the challenge of complex projects and solutions with overall responsibility.',
      education: JSON.stringify([
        'Telecom Engineer, Trainee Program – Ericsson AB (1997)',
        'BSc Mechanical and Computer Engineering, KTH (1993-1996)'
      ]),
      experience: JSON.stringify([
        { customer: 'Preem AB', role: 'Technical Owner & Business Relation Manager', period: '2018 – 2020', description: 'Tekniskt ansvarig för affärsområdet Commodity Supply. Ansvarig för alla IT-system, budget, IT Roadmap, styrgruppsprojekt och leverantörshantering. Attestmandat upp till 500 000 SEK.' },
        { customer: 'Emirates Integrated Telephony Company (UAE)', role: 'Solution Responsible / Lead Architect', period: '2016 – 2017', description: 'Digital TV-plattform baserad på Cloud, NFV och SDN. Teknisk manager för tender värd USD 40 miljoner. Ledde team av arkitekter och specialister.' },
        { customer: 'Emirates Integrated Telephony Company (UAE)', role: 'CDN / Network Optimization Specialist', period: '2015 – 2016', description: 'Cost-benefit-analys och strategiutveckling för videotrafik. Videostrategi som antogs av kunden.' },
        { customer: 'Tunisiana Telecom', role: 'Consultant / Technical Project Manager', period: '2014 – 2015', description: 'E-commerce marketplace för digitalt innehåll. Business Case-verktyg och lönsamhetsberäkning.' },
        { customer: 'Emirates Integrated Telephony Company (UAE)', role: 'Lifecycle Manager / Technical PM', period: '2012 – 2014', description: 'Service Delivery Platform med Apache ServiceMix, Oracle DB, REST/WSDL-integration.' },
        { customer: 'Saudi Telecom Company', role: 'Solution Responsible / Technical PM', period: '2010 – 2012', description: 'Nationellt Mobile TV-system för Live TV och VoD. Ledde integratörteam och specificerade kundanpassningar.' }
      ]),
      certifications: JSON.stringify([
        { name: 'AWS Certified Solutions Architect – Associate', year: '' },
        { name: 'Certified SAFe® 4 Agilist', year: '' },
        { name: 'Certified Senior Solution Architect (Ericsson)', year: '' },
        { name: 'SPIN® Selling (Huthwaite International)', year: '' }
      ]),
      languages: JSON.stringify([
        { language: 'Svenska', level: 'native' },
        { language: 'Danska', level: 'native' },
        { language: 'Engelska', level: 'fluent' },
        { language: 'Spanska', level: 'basic' },
        { language: 'Tyska', level: 'basic' }
      ]),
      employmentHistory: JSON.stringify([
        { company: 'Top of Minds Drive AB', period: '2017 – Nuvarande', role: 'Managementkonsult' },
        { company: 'Ericsson AB (UAE/Dubai)', period: '2011 – 2017', role: 'Solution Architect' },
        { company: 'Ericsson AB (Stockholm)', period: '1997 – 2011', role: 'Engineer / Architect' }
      ]),
      industryExpertise: JSON.stringify(['IT', 'Telekom', 'TV/Media', 'Olja & Gas']),
      nationality: 'Svensk',
      address: 'Biblioteksgatan 29, 114 35 Stockholm',
      linkedin: 'https://linkedin.com/in/ulriklind',
    },
  ];
  const consultants = [];
  for (const cData of consultantDataList) {
    consultants.push(await prisma.consultant.create({ data: cData }));
  }

  // Create contracts with realistic mappings
  const now = new Date();
  const contractDataList = [
    // Connie @ ICA
    {
      title: 'Projektledare & Förändringsledare – Checkout', description: 'Leder Checkout-teamets arbete med ny kassaplattform. Samordning, införande och kvalitet.',
      startDate: new Date(now.getFullYear(), now.getMonth() - 6, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 2, 15),
      rate: 1300, rateType: 'HOURLY', status: 'ACTIVE', renewalNoticeDays: 30, estimatedHours: 1200,
      consultantId: consultants[0].id, clientId: clients[0].id,
    },
    // Gustav @ Autoliv
    {
      title: 'Development Lead – Data Management & BI', description: 'Leder arkitekturboard, BI-utveckling och Cloud migration till Snowflake. Data Mesh Architecture.',
      startDate: new Date(now.getFullYear() - 1, 0, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 3, 1),
      rate: 1250, rateType: 'HOURLY', status: 'ACTIVE', renewalNoticeDays: 30, estimatedHours: 2000,
      consultantId: consultants[1].id, clientId: clients[2].id,
    },
    // Jeff @ Länsförsäkringar
    {
      title: 'Projektledare / Scrum Master – Försäkringsprodukter', description: 'Leder kundupplevelse och prestation av försäkringsprodukter i SAFe-organisation.',
      startDate: new Date(now.getFullYear(), now.getMonth() - 10, 1),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 20),
      rate: 1150, rateType: 'HOURLY', status: 'EXPIRING_SOON', renewalNoticeDays: 30, estimatedHours: 1600,
      consultantId: consultants[2].id, clientId: clients[1].id,
      notes: 'Diskussion om förlängning pågår.',
    },
    // Jon @ Vattenfall
    {
      title: 'Förändringsledning – Investeringsportfölj', description: 'Projektledare för förändringsledningsprojekt som synliggör genomförbarhetsförmågan.',
      startDate: new Date(now.getFullYear(), now.getMonth() - 8, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 4, 1),
      rate: 1200, rateType: 'HOURLY', status: 'ACTIVE', renewalNoticeDays: 30, estimatedHours: 1400,
      consultantId: consultants[4].id, clientId: clients[3].id,
    },
    // Linn StCyr @ Region Stockholm
    {
      title: 'Krav- och projektledare – Dataplattform', description: 'Modernisering av dataplattform. Kravhantering genom intervjuer och workshops.',
      startDate: new Date(now.getFullYear(), now.getMonth() - 3, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 6, 1),
      rate: 1250, rateType: 'HOURLY', status: 'ACTIVE', renewalNoticeDays: 30, estimatedHours: 1200,
      consultantId: consultants[6].id, clientId: clients[6].id,
    },
    // Malin @ Vattenfall
    {
      title: 'Förändringsledare – External Workforce', description: 'Definiering av framtida organisation och operativ målbild. Centre of Excellence-ramverk.',
      startDate: new Date(now.getFullYear(), now.getMonth() - 5, 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 15),
      rate: 1350, rateType: 'HOURLY', status: 'EXPIRING_SOON', renewalNoticeDays: 30, estimatedHours: 960,
      consultantId: consultants[7].id, clientId: clients[3].id,
      notes: 'Vattenfall vill potentiellt förlänga.',
    },
    // Stefan @ Länsförsäkringar
    {
      title: 'RTE & Scrum Master – Analysplattform (IPA)', description: 'RTE för bankens analysplattform. SAFe-ceremonier, BankDW-migration, Oracle-uppgradering.',
      startDate: new Date(now.getFullYear() - 1, 3, 1),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10),
      rate: 1200, rateType: 'HOURLY', status: 'EXPIRING_SOON', renewalNoticeDays: 30, estimatedHours: 1800,
      consultantId: consultants[8].id, clientId: clients[1].id,
      notes: 'Kontrakt löper ut snart. Diskussion om nytt uppdrag.',
    },
    // Historical: Jeff @ IKEA
    {
      title: 'MS Dynamics 365 Implementation', description: 'CRM-implementation för köksavdelningar, B2B och interna bokningssystem.',
      startDate: new Date(2019, 1, 1),
      endDate: new Date(2022, 3, 1),
      rate: 1100, rateType: 'HOURLY', status: 'EXPIRED', renewalNoticeDays: 30, estimatedHours: 4800,
      consultantId: consultants[2].id, clientId: clients[4].id,
      notes: 'Tre framgångsrika projekt levererade.',
    },
  ];
  const contracts = [];
  for (const cData of contractDataList) {
    contracts.push(await prisma.contract.create({ data: cData }));
  }

  // Notifications
  const notifData = [
    { type: 'RENEWAL_WARNING', message: 'Jeffs kontrakt med Länsförsäkringar löper ut om 20 dagar. Förlängning diskuteras.', isRead: false, triggerDate: new Date(), contractId: contracts[2].id },
    { type: 'RENEWAL_WARNING', message: 'Malins kontrakt med Vattenfall löper ut snart. Potentiell förlängning.', isRead: false, triggerDate: new Date(), contractId: contracts[5].id },
    { type: 'RENEWAL_WARNING', message: 'Stefans RTE-kontrakt med Länsförsäkringar Bank löper ut om 10 dagar.', isRead: false, triggerDate: new Date(), contractId: contracts[6].id },
    { type: 'EXPIRATION', message: 'Johan Flink och Linn Holm är tillgängliga och söker nya uppdrag.', isRead: true, triggerDate: new Date(now.getTime() - 3*24*60*60*1000), contractId: contracts[0].id },
  ];
  for (const n of notifData) {
    await prisma.notification.create({ data: n });
  }

  // AI infra + initial admin user (idempotent upserts)
  await seedModelRegistry(prisma);
  await seedDefaultAISettings(prisma);
  await seedInitialAdmin(prisma);

  // Superadmin user (Google OAuth whitelist)
  await prisma.user.upsert({
    where: { email: 'guswes@gmail.com' },
    update: { role: 'SUPERADMIN', isActive: true },
    create: {
      email: 'guswes@gmail.com',
      name: 'Gustav Westergren',
      role: 'SUPERADMIN',
      isActive: true,
    },
  });
  console.log('   ✅ Superadmin user guswes@gmail.com created/updated');

  console.log('✅ Seeding complete!');
  console.log(`   ${clients.length} clients (ICA, LFAB, Autoliv, Vattenfall, IKEA, SJ, Region Sthlm, Telia)`);
  console.log(`   ${consultants.length} consultants (Connie, Gustav, Jeff, Johan, Jon, Linn H, Linn StC, Malin, Stefan, Ulrik)`);
  console.log(`   ${contracts.length} contracts`);
  console.log('   4 notifications');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
