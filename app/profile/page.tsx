'use client';

import { Suspense, useState, useEffect } from "react";
import { useRole } from "@/components/role-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Download } from "lucide-react";
import Link from "next/link";
import { updateUserProfile, scrapeLinkedInProfile, getUserWithProfile } from "@/lib/actions";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { ExperienceSection } from "@/components/profile/experience-section";
import { EducationSection } from "@/components/profile/education-section";
import { CategorizedSkillSelector } from "@/components/profile/skill-selector";
import { SmartImport } from "@/components/profile/smart-import";

export default function ProfilePage() {
    const { currentUser } = useRole();
    const { toast } = useToast();
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Profile state
    const [bio, setBio] = useState("");
    const [jobTitle, setJobTitle] = useState("");
    const [linkedin, setLinkedin] = useState("");

    // Rich state
    const [skills, setSkills] = useState<{ name: string; category: string }[]>([]);
    const [workExperience, setWorkExperience] = useState<any[]>([]);
    const [education, setEducation] = useState<any[]>([]);
    useEffect(() => {
        const fetchUserData = async () => {
            if (currentUser?.id) {
                const result = await getUserWithProfile(currentUser.id);
                if (result.success && result.user) {
                    const user = result.user;
                    setBio(user.bio || "");
                    setJobTitle(user.jobTitle || "");
                    setLinkedin(user.linkedin || "");

                    // Handle potentially legacy or new format skills
                    const rawSkills = user.skills || [];
                    if (Array.isArray(rawSkills) && rawSkills.length > 0 && typeof rawSkills[0] === 'string') {
                        setSkills((rawSkills as any[]).map(s => ({ name: s, category: "General" })));
                    } else {
                        setSkills(rawSkills as any);
                    }

                    // CASTING: The DB relation returns proper objects, ensuring type safety isn't blocking us here if mismatch
                    setWorkExperience((user as any).workExperience || []);
                    setEducation((user as any).education || []);
                }
            }
        };
        fetchUserData();
    }, [currentUser?.id]); // Only re-run if ID changes

    const handleUpdateProfile = async () => {
        if (!currentUser?.id) {
            toast({
                title: "Error",
                description: "User ID is missing. Please try logging in again.",
                variant: "destructive",
            });
            return;
        }
        setIsLoading(true);
        try {
            const result = await updateUserProfile(currentUser.id, {
                bio,
                jobTitle,
                linkedin,
                skills,
                workExperience,
                education
            });

            if (result.success) {
                toast({
                    title: "Profile updated",
                    description: "Your professional profile has been updated.",
                });

                // Update local state with fresh data from server
                if (result.user) {
                    const user = result.user;
                    setBio(user.bio || "");
                    setJobTitle(user.jobTitle || "");
                    setLinkedin(user.linkedin || "");
                    setSkills((user.skills as any) || []);
                    setWorkExperience((user as any).workExperience || []);
                    setEducation((user as any).education || []);
                }

                setIsEditing(false);
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: (result as any).error || "Failed to update profile",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Profile update error:", error);
            toast({
                title: "Error",
                description: "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSmartImport = (data: any) => {
        if (data.bio) setBio(data.bio);
        if (data.jobTitle) setJobTitle(data.jobTitle);

        if (data.skills && Array.isArray(data.skills)) {
            setSkills(data.skills);
        }

        if (data.workExperience) {
            setWorkExperience(data.workExperience.map((w: any) => ({
                ...w,
                id: crypto.randomUUID()
            })));
        }

        if (data.education) {
            setEducation(data.education.map((e: any) => ({
                ...e,
                id: crypto.randomUUID()
            })));
        }
    };

    const handleImportLinkedIn = async () => {
        if (!linkedin) return;
        setIsImporting(true);
        try {
            const result = await scrapeLinkedInProfile(linkedin);
            if (result.success && result.data) {
                const data = result.data;

                // Update state with imported data
                if (data.bio) setBio(data.bio);
                if (data.jobTitle) setJobTitle(data.jobTitle);

                if (data.skills && Array.isArray(data.skills)) {
                    // Check if deep object or strings (mock returns objects now)
                    const importedSkills = data.skills.map((s: any) =>
                        typeof s === 'string' ? { name: s, category: "Imported" } : s
                    );
                    setSkills(importedSkills);
                }

                if (data.workExperience) {
                    setWorkExperience(data.workExperience.map((w: any) => ({
                        ...w,
                        id: w.id || crypto.randomUUID()
                    })));
                }
                if (data.education) {
                    setEducation(data.education.map((e: any) => ({
                        ...e,
                        id: e.id || crypto.randomUUID()
                    })));
                }

                toast({ title: "Profile Imported", description: "Data fetched successfully from LinkedIn." });

                // Auto-enter edit mode to let user review
                setIsEditing(true);
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Import Failed", description: "Could not fetch data.", variant: "destructive" });
        } finally {
            setIsImporting(false);
        }
    };

    if (!currentUser) {
        return <div className="p-8 text-center">Loading profile...</div>;
    }

    return (
        <div className="min-h-screen bg-slate-50/50 p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/board">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
                        <p className="text-muted-foreground">Manage your professional identity, experience, and skills.</p>
                    </div>
                </div>

                {/* Main Card */}
                <Card className="border-t-4 border-t-purple-600 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6 border-b">
                        <div className="flex flex-col space-y-1">
                            <CardTitle className="text-xl">Professional Overview</CardTitle>
                            <CardDescription>
                                This information will be used to match you with relevant projects.
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            {!isEditing ? (
                                <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
                            ) : (
                                <>
                                    <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                                    <Button onClick={handleUpdateProfile} disabled={isLoading}>
                                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Changes
                                    </Button>
                                </>
                            )}
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-8 pt-8">
                        {/* Import Section */}
                        {isEditing && (
                            <div className="space-y-6">
                                {/* Smart CV Import */}
                                <div className="space-y-2">
                                    <Label className="text-base font-semibold">Smart Import</Label>
                                    <SmartImport onImport={handleSmartImport} />
                                </div>

                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t" />
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-background px-2 text-muted-foreground">Or import from</span>
                                    </div>
                                </div>

                                {/* LinkedIn Import */}
                                <div className="bg-slate-50 p-4 rounded-lg border flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
                                    <div className="grid gap-2 w-full">
                                        <Label className="text-slate-600">LinkedIn Profile</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="https://linkedin.com/in/username"
                                                value={linkedin}
                                                onChange={(e) => setLinkedin(e.target.value)}
                                            />
                                            <Button
                                                variant="secondary"
                                                onClick={handleImportLinkedIn}
                                                disabled={isImporting || !linkedin}
                                            >
                                                {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                                                Import
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Basic Info */}
                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <Label className="text-base">Current Job Title</Label>
                                <Input
                                    className="text-lg font-medium"
                                    placeholder="e.g. Senior Solution Architect"
                                    value={jobTitle}
                                    onChange={(e) => setJobTitle(e.target.value)}
                                    disabled={!isEditing}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label className="text-base">Professional Bio</Label>
                                <textarea
                                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder="Summarize your expertise and background..."
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    disabled={!isEditing}
                                />
                            </div>
                        </div>

                        {/* Skills Section */}
                        <CategorizedSkillSelector
                            skills={skills}
                            onChange={setSkills}
                            isEditing={isEditing}
                        />

                        {/* Work Experience Section */}
                        <ExperienceSection
                            experiences={workExperience}
                            onChange={setWorkExperience}
                            isEditing={isEditing}
                        />

                        {/* Education Section */}
                        <EducationSection
                            education={education}
                            onChange={setEducation}
                            isEditing={isEditing}
                        />

                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
