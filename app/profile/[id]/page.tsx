import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Linkedin, Mail, Briefcase, MapPin, Building } from "lucide-react";
import Link from "next/link";

export default async function ProfilePage({ params }: { params: { id: string } }) {
    const { id } = await params;

    // In strict mode or newer Next.js patterns, params might need to be awaited if it's a Promise
    // But typically in 14/15 it's passed as prop. If this errors, I'll adjust.
    // Update: Next.js 15 treats params as a promise in some contexts, but usually safely awaitable.

    const user = await db.query.users.findFirst({
        where: eq(users.id, id),
        with: {
            company: true
        }
    }) as any; // Using any for quick casting of joined relations if types aren't perfect

    if (!user) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-slate-50/50 p-8">
            <div className="max-w-3xl mx-auto space-y-8">
                <div className="mb-8">
                    <Button variant="ghost" asChild className="-ml-4 mb-4">
                        <Link href="/board" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Board
                        </Link>
                    </Button>
                </div>

                <div className="grid gap-6">
                    {/* Header Card */}
                    <Card className="overflow-hidden border-none shadow-md">
                        <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-700"></div>
                        <CardContent className="pt-0 relative">
                            <div className="flex flex-col md:flex-row gap-6 items-start">
                                <Avatar className="h-32 w-32 border-4 border-white shadow-lg -mt-16 bg-white">
                                    <AvatarImage src={user.image || user.avatar} className="object-cover" />
                                    <AvatarFallback className="text-4xl">{user.name?.[0]}</AvatarFallback>
                                </Avatar>
                                <div className="pt-4 flex-1 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
                                                {user.name}
                                            </h1>
                                            <p className="text-lg text-muted-foreground flex items-center gap-2">
                                                {user.role}
                                                {user.company && (
                                                    <>
                                                        <span className="text-gray-300">•</span>
                                                        <span className="flex items-center gap-1 text-sm">
                                                            <Building className="h-3 w-3" />
                                                            {user.company.name}
                                                        </span>
                                                    </>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            {user.linkedin && (
                                                <Button size="icon" variant="outline" asChild>
                                                    <a href={user.linkedin} target="_blank" rel="noopener noreferrer">
                                                        <Linkedin className="h-4 w-4 text-[#0077b5]" />
                                                    </a>
                                                </Button>
                                            )}
                                            <Button size="icon" variant="outline" asChild>
                                                <a href={`mailto:${user.email}`}>
                                                    <Mail className="h-4 w-4" />
                                                </a>
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 pt-2">
                                        {user.availability === 'Available' && (
                                            <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">
                                                Available for work
                                            </Badge>
                                        )}
                                        {user.experience && (
                                            <Badge variant="outline" className="flex items-center gap-1">
                                                <Briefcase className="h-3 w-3" />
                                                {user.experience} Experience
                                            </Badge>
                                        )}
                                        {user.location && (
                                            <Badge variant="outline" className="flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {user.location}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid md:grid-cols-3 gap-6">
                        {/* Main Content */}
                        <div className="md:col-span-2 space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>About</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                                        {user.bio || "No bio information provided."}
                                    </p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Skills & Expertise</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {user.skills && user.skills.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {user.skills.map((skill: string, i: number) => (
                                                <Badge key={i} variant="secondary" className="px-3 py-1">
                                                    {skill}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No skills listed.</p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Industry Experience</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {user.industry && user.industry.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {user.industry.map((ind: string, i: number) => (
                                                <Badge key={i} variant="outline">
                                                    {ind}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Not specified.</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="bg-blue-50/50 border-blue-100">
                                <CardContent className="pt-6">
                                    <div className="text-center space-y-4">
                                        <h3 className="font-semibold text-blue-900">Interested in working with {user.name.split(' ')[0]}?</h3>
                                        <Button className="w-full bg-blue-600 hover:bg-blue-700">
                                            Send Project Request
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
