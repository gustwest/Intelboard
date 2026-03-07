import { db } from "../lib/db";
import { users, workExperience, education } from "../lib/schema";
import { eq } from "drizzle-orm";

const bcrypt = require("bcryptjs");

interface SpecialistSeed {
    id: string;
    name: string;
    email: string;
    jobTitle: string;
    bio: string;
    skills: { name: string; category: string }[];
    industry: string[];
    availability: string;
    experience: string;
    linkedin: string;
    work: { company: string; title: string; startDate: string; endDate: string | null; description: string; location: string }[];
    edu: { school: string; degree: string; fieldOfStudy: string; startDate: string; endDate: string }[];
}

const specialistData: SpecialistSeed[] = [
    {
        id: "sp-1",
        name: "Alice Chen",
        email: "alice.chen@intelboard.io",
        jobTitle: "Digital Transformation Consultant",
        bio: "Senior consultant with 10+ years driving digital transformation in automotive and manufacturing. Expert in supply chain optimization, IoT integration, and Industry 4.0 strategy. Proven track record of delivering measurable ROI through technology-enabled process improvements.",
        skills: [
            { name: "Supply Chain", category: "Domain" },
            { name: "IoT", category: "Technology" },
            { name: "Process Optimization", category: "Domain" },
            { name: "Digital Transformation", category: "Strategy" },
            { name: "Agile", category: "Methodology" },
            { name: "SAP", category: "Technology" },
        ],
        industry: ["Auto", "Manufacturing"],
        availability: "Available",
        experience: "10+ years",
        linkedin: "https://linkedin.com/in/alice-chen-consulting",
        work: [
            { company: "Deloitte Digital", title: "Senior Consultant", startDate: "2019-03-01", endDate: null, description: "Leading digital transformation engagements for automotive OEMs and Tier-1 suppliers. Delivered $2M+ in annual savings through IoT-enabled supply chain visibility.", location: "Stockholm, Sweden" },
            { company: "Capgemini", title: "Consultant", startDate: "2015-06-01", endDate: "2019-02-01", description: "Managed SAP implementations and process optimization projects for manufacturing clients across EMEA.", location: "Gothenburg, Sweden" },
        ],
        edu: [
            { school: "KTH Royal Institute of Technology", degree: "M.Sc.", fieldOfStudy: "Industrial Engineering", startDate: "2011-09-01", endDate: "2013-06-01" },
        ],
    },
    {
        id: "sp-2",
        name: "Bob Smith",
        email: "bob.smith@intelboard.io",
        jobTitle: "Cloud Architect",
        bio: "AWS-certified Solutions Architect with deep expertise in cloud migration, infrastructure-as-code, and DevOps practices. Specialized in financial services compliance and high-availability architectures. Has migrated 50+ enterprise workloads to AWS and Azure.",
        skills: [
            { name: "AWS", category: "Cloud" },
            { name: "Azure", category: "Cloud" },
            { name: "Migration", category: "Cloud" },
            { name: "DevOps", category: "Methodology" },
            { name: "Kubernetes", category: "Technology" },
            { name: "Terraform", category: "Technology" },
        ],
        industry: ["Finance", "Tech"],
        availability: "Available",
        experience: "8 years",
        linkedin: "https://linkedin.com/in/bob-smith-cloud",
        work: [
            { company: "AWS Professional Services", title: "Senior Cloud Architect", startDate: "2020-01-01", endDate: null, description: "Designing and implementing cloud architectures for enterprise financial services clients. Focus on security, compliance, and cost optimization.", location: "London, UK" },
            { company: "Nordea", title: "Cloud Engineer", startDate: "2017-04-01", endDate: "2019-12-01", description: "Led the bank's cloud-first initiative, migrating core banking systems to AWS with zero downtime.", location: "Stockholm, Sweden" },
        ],
        edu: [
            { school: "Chalmers University of Technology", degree: "M.Sc.", fieldOfStudy: "Computer Science", startDate: "2013-09-01", endDate: "2015-06-01" },
        ],
    },
    {
        id: "sp-3",
        name: "Carol Davis",
        email: "carol.davis@intelboard.io",
        jobTitle: "Data Scientist",
        bio: "PhD-level data scientist specializing in machine learning, NLP, and predictive analytics for healthcare and technology. Published researcher with 15+ peer-reviewed papers. Experienced in building production ML pipelines and establishing data science teams from scratch.",
        skills: [
            { name: "Machine Learning", category: "AI/ML" },
            { name: "Python", category: "Programming" },
            { name: "Big Data", category: "Data" },
            { name: "NLP", category: "AI/ML" },
            { name: "TensorFlow", category: "AI/ML" },
            { name: "SQL", category: "Data" },
        ],
        industry: ["Healthcare", "Tech"],
        availability: "Available",
        experience: "7 years",
        linkedin: "https://linkedin.com/in/carol-davis-datascience",
        work: [
            { company: "AstraZeneca", title: "Lead Data Scientist", startDate: "2021-02-01", endDate: null, description: "Building ML models for drug discovery and clinical trial optimization. Reduced patient recruitment time by 30% through predictive modeling.", location: "Gothenburg, Sweden" },
            { company: "Spotify", title: "Data Scientist", startDate: "2018-09-01", endDate: "2021-01-01", description: "Developed NLP-based content recommendation systems. Improved user engagement metrics by 18%.", location: "Stockholm, Sweden" },
        ],
        edu: [
            { school: "Uppsala University", degree: "Ph.D.", fieldOfStudy: "Computational Linguistics", startDate: "2014-09-01", endDate: "2018-06-01" },
        ],
    },
    {
        id: "sp-4",
        name: "David Wilson",
        email: "david.wilson@intelboard.io",
        jobTitle: "Agile Coach",
        bio: "Certified SAFe Program Consultant and Scrum Master with 12 years of experience coaching agile transformations for automotive and retail organizations. Passionate about building high-performing teams and establishing continuous delivery cultures.",
        skills: [
            { name: "Scrum", category: "Methodology" },
            { name: "Kanban", category: "Methodology" },
            { name: "Agile", category: "Methodology" },
            { name: "Project Management", category: "Management" },
            { name: "SAFe", category: "Methodology" },
            { name: "Change Management", category: "Management" },
        ],
        industry: ["Auto", "Retail"],
        availability: "Busy",
        experience: "12 years",
        linkedin: "https://linkedin.com/in/david-wilson-agile",
        work: [
            { company: "Volvo Group", title: "Enterprise Agile Coach", startDate: "2020-06-01", endDate: null, description: "Coaching 15+ scrum teams across R&D and IT. Established SAFe framework for the connected vehicles division.", location: "Gothenburg, Sweden" },
            { company: "H&M Group", title: "Agile Coach", startDate: "2016-01-01", endDate: "2020-05-01", description: "Drove agile adoption across e-commerce and supply chain teams. Reduced time-to-market by 40%.", location: "Stockholm, Sweden" },
        ],
        edu: [
            { school: "Lund University", degree: "M.Sc.", fieldOfStudy: "Software Engineering", startDate: "2009-09-01", endDate: "2011-06-01" },
        ],
    },
    {
        id: "sp-5",
        name: "Eve Johnson",
        email: "eve.johnson@intelboard.io",
        jobTitle: "Cybersecurity Analyst",
        bio: "CISSP-certified cybersecurity professional with expertise in threat analysis, penetration testing, and compliance frameworks (ISO 27001, GDPR, SOC 2). Specialized in financial services and critical infrastructure protection.",
        skills: [
            { name: "Cybersecurity", category: "Security" },
            { name: "Network Security", category: "Security" },
            { name: "Compliance", category: "Security" },
            { name: "Penetration Testing", category: "Security" },
            { name: "Risk Management", category: "Management" },
            { name: "GDPR", category: "Compliance" },
        ],
        industry: ["Finance", "Energy"],
        availability: "Available",
        experience: "9 years",
        linkedin: "https://linkedin.com/in/eve-johnson-security",
        work: [
            { company: "PwC Sweden", title: "Senior Cybersecurity Consultant", startDate: "2019-08-01", endDate: null, description: "Leading security assessments and compliance audits for financial institutions. Developed incident response frameworks for 10+ clients.", location: "Stockholm, Sweden" },
            { company: "Vattenfall", title: "Security Analyst", startDate: "2016-03-01", endDate: "2019-07-01", description: "Protected critical energy infrastructure. Implemented zero-trust network architecture.", location: "Stockholm, Sweden" },
        ],
        edu: [
            { school: "Linköping University", degree: "M.Sc.", fieldOfStudy: "Information Security", startDate: "2012-09-01", endDate: "2014-06-01" },
        ],
    },
    {
        id: "sp-6",
        name: "Frank Brown",
        email: "frank.brown@intelboard.io",
        jobTitle: "DevOps Engineer",
        bio: "Infrastructure automation specialist with deep knowledge of containerization, CI/CD pipelines, and platform engineering. Experienced in building developer platforms that scale from 10 to 500+ engineers.",
        skills: [
            { name: "Docker", category: "DevOps" },
            { name: "Kubernetes", category: "DevOps" },
            { name: "AWS", category: "Cloud" },
            { name: "CI/CD", category: "DevOps" },
            { name: "Terraform", category: "DevOps" },
            { name: "Go", category: "Programming" },
        ],
        industry: ["Tech", "Logistics"],
        availability: "Available",
        experience: "6 years",
        linkedin: "https://linkedin.com/in/frank-brown-devops",
        work: [
            { company: "Klarna", title: "Senior Platform Engineer", startDate: "2021-04-01", endDate: null, description: "Building and maintaining the internal developer platform serving 500+ engineers. Reduced deployment time from 45min to 5min.", location: "Stockholm, Sweden" },
            { company: "PostNord", title: "DevOps Engineer", startDate: "2019-01-01", endDate: "2021-03-01", description: "Containerized legacy logistics applications. Built CI/CD pipelines for 30+ microservices.", location: "Solna, Sweden" },
        ],
        edu: [
            { school: "Malmö University", degree: "B.Sc.", fieldOfStudy: "Computer Engineering", startDate: "2015-09-01", endDate: "2018-06-01" },
        ],
    },
    {
        id: "sp-7",
        name: "Grace Taylor",
        email: "grace.taylor@intelboard.io",
        jobTitle: "UX/UI Designer",
        bio: "Award-winning product designer with expertise in design systems, user research, and accessibility. Passionate about creating intuitive digital experiences for healthcare and retail. Former design lead at two Y Combinator startups.",
        skills: [
            { name: "Figma", category: "Design" },
            { name: "User Research", category: "Design" },
            { name: "Prototyping", category: "Design" },
            { name: "React", category: "Technology" },
            { name: "Design Systems", category: "Design" },
            { name: "Accessibility", category: "Design" },
        ],
        industry: ["Retail", "Healthcare"],
        availability: "Available",
        experience: "8 years",
        linkedin: "https://linkedin.com/in/grace-taylor-design",
        work: [
            { company: "IKEA Digital", title: "Senior Product Designer", startDate: "2021-01-01", endDate: null, description: "Leading the design system team. Redesigned the checkout experience resulting in 22% conversion improvement.", location: "Malmö, Sweden" },
            { company: "Kry/Livi", title: "Lead Designer", startDate: "2018-06-01", endDate: "2020-12-01", description: "Designed the patient-facing telemedicine app used by 2M+ users. Won Swedish Design Award 2020.", location: "Stockholm, Sweden" },
        ],
        edu: [
            { school: "Konstfack", degree: "M.F.A.", fieldOfStudy: "Interaction Design", startDate: "2014-09-01", endDate: "2016-06-01" },
        ],
    },
    {
        id: "sp-8",
        name: "Hank Miller",
        email: "hank.miller@intelboard.io",
        jobTitle: "Systems Analyst",
        bio: "Enterprise systems architect with deep expertise in ERP systems, data modeling, and system integration for manufacturing and energy sectors. 15 years of experience bridging business requirements and technical solutions.",
        skills: [
            { name: "SQL", category: "Data" },
            { name: "NoSQL", category: "Data" },
            { name: "Java", category: "Programming" },
            { name: "Risk Management", category: "Management" },
            { name: "SAP", category: "Technology" },
            { name: "System Integration", category: "Technology" },
        ],
        industry: ["Manufacturing", "Energy"],
        availability: "Available",
        experience: "15 years",
        linkedin: "https://linkedin.com/in/hank-miller-systems",
        work: [
            { company: "ABB", title: "Lead Systems Architect", startDate: "2017-03-01", endDate: null, description: "Designing integration architecture for industrial automation systems. Leading a team of 8 engineers.", location: "Västerås, Sweden" },
            { company: "Sandvik", title: "Systems Analyst", startDate: "2012-01-01", endDate: "2017-02-01", description: "Managed SAP ERP implementation and integration with manufacturing execution systems.", location: "Sandviken, Sweden" },
        ],
        edu: [
            { school: "Mälardalen University", degree: "M.Sc.", fieldOfStudy: "Computer Science", startDate: "2008-09-01", endDate: "2010-06-01" },
        ],
    },
    {
        id: "sp-9",
        name: "Ivy Anderson",
        email: "ivy.anderson@intelboard.io",
        jobTitle: "AI/ML Engineer",
        bio: "Machine learning engineer specialized in computer vision, deep learning, and MLOps. Building production AI systems for autonomous driving and industrial quality inspection. Published at NeurIPS and ICML.",
        skills: [
            { name: "TensorFlow", category: "AI/ML" },
            { name: "PyTorch", category: "AI/ML" },
            { name: "Python", category: "Programming" },
            { name: "NLP", category: "AI/ML" },
            { name: "Computer Vision", category: "AI/ML" },
            { name: "MLOps", category: "DevOps" },
        ],
        industry: ["Tech", "Auto"],
        availability: "Busy",
        experience: "5 years",
        linkedin: "https://linkedin.com/in/ivy-anderson-ml",
        work: [
            { company: "Zenseact (Volvo)", title: "ML Engineer", startDate: "2022-01-01", endDate: null, description: "Developing perception models for autonomous driving. Working with LiDAR and camera fusion pipelines.", location: "Gothenburg, Sweden" },
            { company: "Axis Communications", title: "AI Engineer", startDate: "2020-06-01", endDate: "2021-12-01", description: "Built edge AI models for video analytics. Reduced inference latency by 60% through model optimization.", location: "Lund, Sweden" },
        ],
        edu: [
            { school: "Chalmers University of Technology", degree: "M.Sc.", fieldOfStudy: "Machine Learning", startDate: "2017-09-01", endDate: "2019-06-01" },
        ],
    },
    {
        id: "sp-10",
        name: "Jack Thomas",
        email: "jack.thomas@intelboard.io",
        jobTitle: "Business Analyst",
        bio: "Strategic business analyst with strong quantitative skills and deep domain expertise in financial services and retail. Expert in data-driven decision making, market analysis, and business process reengineering.",
        skills: [
            { name: "Big Data", category: "Data" },
            { name: "SQL", category: "Data" },
            { name: "Project Management", category: "Management" },
            { name: "Business Intelligence", category: "Data" },
            { name: "Power BI", category: "Technology" },
            { name: "Financial Modeling", category: "Finance" },
        ],
        industry: ["Finance", "Retail"],
        availability: "Available",
        experience: "11 years",
        linkedin: "https://linkedin.com/in/jack-thomas-analytics",
        work: [
            { company: "SEB", title: "Senior Business Analyst", startDate: "2019-09-01", endDate: null, description: "Leading analytics for the retail banking division. Built predictive models for customer churn reducing attrition by 15%.", location: "Stockholm, Sweden" },
            { company: "McKinsey & Company", title: "Business Analyst", startDate: "2015-01-01", endDate: "2019-08-01", description: "Delivered strategy and analytics engagements for Nordic retail and banking clients.", location: "Stockholm, Sweden" },
        ],
        edu: [
            { school: "Stockholm School of Economics", degree: "M.Sc.", fieldOfStudy: "Finance", startDate: "2011-09-01", endDate: "2013-06-01" },
        ],
    },
    {
        id: "sp-11",
        name: "Kara Jackson",
        email: "kara.jackson@intelboard.io",
        jobTitle: "Blockchain Developer",
        bio: "Full-stack blockchain engineer with expertise in smart contract development, DeFi protocols, and tokenization. Experienced in building enterprise blockchain solutions for supply chain traceability and financial compliance.",
        skills: [
            { name: "Blockchain", category: "Technology" },
            { name: "Smart Contracts", category: "Technology" },
            { name: "Solidity", category: "Programming" },
            { name: "React", category: "Technology" },
            { name: "Node.js", category: "Programming" },
            { name: "Rust", category: "Programming" },
        ],
        industry: ["Finance", "Tech"],
        availability: "Available",
        experience: "5 years",
        linkedin: "https://linkedin.com/in/kara-jackson-blockchain",
        work: [
            { company: "ChromaWay", title: "Senior Blockchain Engineer", startDate: "2021-08-01", endDate: null, description: "Building enterprise blockchain solutions for real estate tokenization and supply chain traceability.", location: "Stockholm, Sweden" },
            { company: "ConsenSys", title: "Solidity Developer", startDate: "2019-03-01", endDate: "2021-07-01", description: "Developed smart contracts for DeFi lending protocols. Audited contracts with $100M+ TVL.", location: "Remote" },
        ],
        edu: [
            { school: "KTH Royal Institute of Technology", degree: "M.Sc.", fieldOfStudy: "Distributed Systems", startDate: "2015-09-01", endDate: "2017-06-01" },
        ],
    },
    {
        id: "sp-12",
        name: "Leo White",
        email: "leo.white@intelboard.io",
        jobTitle: "Project Manager",
        bio: "PMP-certified project manager with 14 years of experience delivering complex initiatives in automotive and heavy industry. Expert in stakeholder management, risk mitigation, and hybrid project methodologies.",
        skills: [
            { name: "Project Management", category: "Management" },
            { name: "Risk Management", category: "Management" },
            { name: "Agile", category: "Methodology" },
            { name: "Stakeholder Management", category: "Management" },
            { name: "PRINCE2", category: "Methodology" },
            { name: "MS Project", category: "Technology" },
        ],
        industry: ["Auto", "Manufacturing"],
        availability: "Available",
        experience: "14 years",
        linkedin: "https://linkedin.com/in/leo-white-pm",
        work: [
            { company: "Scania", title: "Senior Project Manager", startDate: "2018-04-01", endDate: null, description: "Managing cross-functional digitalization programs worth €5M+. Delivered electrification control system project on time and under budget.", location: "Södertälje, Sweden" },
            { company: "Saab", title: "Project Manager", startDate: "2013-01-01", endDate: "2018-03-01", description: "Managed defense systems integration projects with 50+ stakeholders across 5 countries.", location: "Linköping, Sweden" },
        ],
        edu: [
            { school: "Linköping University", degree: "M.Sc.", fieldOfStudy: "Industrial Engineering", startDate: "2008-09-01", endDate: "2010-06-01" },
        ],
    },
];

async function main() {
    console.log("🌱 Seeding 12 specialist accounts...\n");

    const hashedPassword = await bcrypt.hash("password123", 10);

    for (const sp of specialistData) {
        console.log(`  → ${sp.name} (${sp.email})`);

        // Upsert user
        const existing = await db.query.users.findFirst({
            where: eq(users.email, sp.email),
        });

        let userId: string;

        if (existing) {
            console.log(`    Already exists (${existing.id}). Updating...`);
            userId = existing.id;
            await db.update(users).set({
                name: sp.name,
                password: hashedPassword,
                role: "Specialist",
                approvalStatus: "APPROVED",
                bio: sp.bio,
                jobTitle: sp.jobTitle,
                skills: sp.skills,
                industry: sp.industry,
                availability: sp.availability,
                experience: sp.experience,
                linkedin: sp.linkedin,
                image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${sp.name.replace(/ /g, '')}`,
            }).where(eq(users.id, existing.id));
        } else {
            console.log(`    Creating new user...`);
            const [newUser] = await db.insert(users).values({
                id: sp.id,
                name: sp.name,
                email: sp.email,
                password: hashedPassword,
                role: "Specialist",
                approvalStatus: "APPROVED",
                bio: sp.bio,
                jobTitle: sp.jobTitle,
                skills: sp.skills,
                industry: sp.industry,
                availability: sp.availability,
                experience: sp.experience,
                linkedin: sp.linkedin,
                image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${sp.name.replace(/ /g, '')}`,
            }).returning();
            userId = newUser.id;
        }

        // Clear and re-insert work experience
        await db.delete(workExperience).where(eq(workExperience.userId, userId));
        for (const w of sp.work) {
            await db.insert(workExperience).values({
                userId,
                company: w.company,
                title: w.title,
                startDate: new Date(w.startDate),
                endDate: w.endDate ? new Date(w.endDate) : null,
                description: w.description,
                location: w.location,
            });
        }

        // Clear and re-insert education
        await db.delete(education).where(eq(education.userId, userId));
        for (const e of sp.edu) {
            await db.insert(education).values({
                userId,
                school: e.school,
                degree: e.degree,
                fieldOfStudy: e.fieldOfStudy,
                startDate: new Date(e.startDate),
                endDate: new Date(e.endDate),
            });
        }

        console.log(`    ✅ Done\n`);
    }

    console.log("🎉 All 12 specialists seeded successfully!");
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
});
