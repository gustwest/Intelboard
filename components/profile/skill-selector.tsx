'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Tag } from "lucide-react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

interface Skill {
    name: string;
    category: string;
}

interface SkillSelectorProps {
    skills: Skill[];
    onChange: (skills: Skill[]) => void;
    isEditing: boolean;
}

const COMMON_CATEGORIES = [
    "Development", "Design", "Project Management", "Leadership",
    "Data Science", "Cloud", "Methodologies", "Languages", "Tools"
];

export function CategorizedSkillSelector({ skills, onChange, isEditing }: SkillSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [newSkillName, setNewSkillName] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(COMMON_CATEGORIES[0]);

    // Group skills by category for display
    const groupedSkills = skills.reduce((acc, skill) => {
        if (!acc[skill.category]) acc[skill.category] = [];
        acc[skill.category].push(skill);
        return acc;
    }, {} as Record<string, Skill[]>);

    const handleAdd = () => {
        if (!newSkillName) return;
        // Check duplicate
        if (skills.some(s => s.name.toLowerCase() === newSkillName.toLowerCase())) return;

        onChange([...skills, { name: newSkillName, category: selectedCategory }]);
        setNewSkillName("");
    };

    const handleRemove = (name: string) => {
        onChange(skills.filter(s => s.name !== name));
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Skills & Expertise
            </h3>

            {Object.entries(groupedSkills).length === 0 && (
                <div className="text-center p-4 border rounded-lg border-dashed text-muted-foreground text-sm">
                    No skills listed.
                </div>
            )}

            <div className="space-y-4">
                {Object.entries(groupedSkills).map(([category, categorySkills]) => (
                    <div key={category} className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{category}</h4>
                        <div className="flex flex-wrap gap-2">
                            {categorySkills.map((skill) => (
                                <Badge key={skill.name} variant="secondary" className="px-2 py-1 text-sm flex items-center gap-1">
                                    {skill.name}
                                    {isEditing && (
                                        <button onClick={() => handleRemove(skill.name)} className="text-muted-foreground hover:text-red-500 ml-1">
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </Badge>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {isEditing && (
                <div className="flex gap-2 items-end pt-2 border-t mt-4">
                    <div className="grid gap-2 flex-1">
                        <Label>New Skill</Label>
                        <Input
                            placeholder="e.g. React"
                            value={newSkillName}
                            onChange={(e) => setNewSkillName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                    </div>
                    <div className="grid gap-2 w-[180px]">
                        <Label>Category</Label>
                        <Popover open={isOpen} onOpenChange={setIsOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" aria-expanded={isOpen} className="justify-between">
                                    {selectedCategory}
                                    <Plus className="ml-2 h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[200px] p-0">
                                <Command>
                                    <CommandInput placeholder="Search category..." />
                                    <CommandList>
                                        <CommandEmpty>
                                            <Button variant="ghost" size="sm" onClick={() => {
                                                // Allow random custom categories? For now stick to list or basic custom logic
                                                // Simplified for MVP: just use input match
                                            }}>Type to generic</Button>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {COMMON_CATEGORIES.map((category) => (
                                                <CommandItem
                                                    key={category}
                                                    value={category}
                                                    onSelect={(currentValue) => {
                                                        setSelectedCategory(currentValue);
                                                        setIsOpen(false);
                                                    }}
                                                >
                                                    {category}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <Button onClick={handleAdd}>Add</Button>
                </div>
            )}
        </div>
    );
}
