import { Message } from '@/lib/it-flora/ai-architect';
import { User, Bot, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/it-flora/ui/Button';
import { Input } from '@/components/it-flora/ui/Input';

interface AIConversationProps {
    messages: Message[];
    onSendMessage: (message: string) => void;
    isLoading?: boolean;
    currentQuestion?: string;
}

export function AIConversation({ messages, onSendMessage, isLoading, currentQuestion }: AIConversationProps) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg border border-slate-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
                        <Bot className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900">Architecture Advisor</h3>
                        <p className="text-xs text-slate-600">
                            {isLoading ? 'Thinking...' : 'Ready to help design your architecture'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                    <div className="text-center text-slate-400 py-12">
                        <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">
                            Complete the requirements form to start the conversation
                        </p>
                    </div>
                )}

                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                            }`}
                    >
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${message.role === 'user'
                                    ? 'bg-slate-200'
                                    : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                                }`}
                        >
                            {message.role === 'user' ? (
                                <User className="h-5 w-5 text-slate-600" />
                            ) : (
                                <Bot className="h-5 w-5 text-white" />
                            )}
                        </div>
                        <div
                            className={`flex-1 rounded-lg px-4 py-3 ${message.role === 'user'
                                    ? 'bg-slate-100 text-slate-900'
                                    : 'bg-blue-50 text-slate-800 border border-blue-100'
                                }`}
                        >
                            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                            <div className="text-xs text-slate-400 mt-2">
                                {new Date(message.timestamp).toLocaleTimeString()}
                            </div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                            <Bot className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 rounded-lg px-4 py-3 bg-blue-50 border border-blue-100">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Analyzing your requirements...
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {currentQuestion && (
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={
                                currentQuestion || 'Type your answer...'
                            }
                            disabled={isLoading}
                            className="flex-1"
                        />
                        <Button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            Send
                        </Button>
                    </form>
                </div>
            )}
        </div>
    );
}
