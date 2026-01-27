import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { InviteUserDialog } from "@/components/invite-user-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export default async function TeamPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/");
    }

    const companyId = (session.user as any).companyId;

    if (!companyId) {
        return (
            <div className="container mx-auto p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Team Management</CardTitle>
                        <CardDescription>You are not part of any organization.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    // Fetch company details
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));

    // Fetch team members
    const teamMembers = await db.select().from(users).where(eq(users.companyId, companyId));

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{company?.name || "My Organization"}</h1>
                    <p className="text-muted-foreground">Manage your team members and access.</p>
                </div>
                <InviteUserDialog companyId={companyId} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Team Members</CardTitle>
                    <CardDescription>
                        Users with access to {company?.name} projects.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {teamMembers.map((member) => (
                            <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="flex items-center gap-4">
                                    <Avatar>
                                        <AvatarImage src={member.image || ""} />
                                        <AvatarFallback>{member.name?.charAt(0) || "U"}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-medium">{member.name}</p>
                                        <p className="text-sm text-muted-foreground">{member.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant={member.role === 'Admin' ? 'default' : 'secondary'}>
                                        {member.role}
                                    </Badge>
                                    {member.approvalStatus !== 'APPROVED' && (
                                        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                                            {member.approvalStatus}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
