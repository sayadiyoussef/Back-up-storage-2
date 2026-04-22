import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  timestamp: string;
  channelId: string;
  userId?: string;
}

export default function ChatPreview() {
  const [quickMessage, setQuickMessage] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: chatData } = useQuery({
    queryKey: ["/api/chat","preview"],
    queryFn: async () => {
      // Pick first channel
      const ch = await apiRequest("GET","/api/chat/channels").then(r=>r.json());
      const first = (ch as any)?.data?.[0]?.id || "";
      const msgs = first ? await apiRequest("GET", `/api/chat?channelId=${first}`).then(r=>r.json()) : { data: [] };
      return msgs;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const messages: ChatMessage[] = (chatData as any)?.data?.slice(-3) || []; // Show only last 3 messages

  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: { sender: string; message: string; userId?: string }) => {
      await apiRequest("POST", "/api/chat", messageData);
    },
    onSuccess: () => {
      setQuickMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleQuickMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickMessage.trim() || !user) return;

    sendMessageMutation.mutate({
      sender: user.name,
      message: quickMessage.trim(),
      userId: user.id,
    });
  };

  const getAvatarUrl = (sender: string) => {
    const avatars = [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&w=150&h=150&fit=crop&crop=face",
      "https://images.unsplash.com/photo-1494790108755-2616b612b1e9?ixlib=rb-4.0.3&w=150&h=150&fit=crop&crop=face",
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&w=150&h=150&fit=crop&crop=face",
    ];
    
    if (sender === "System") return "";
    const index = sender.length % avatars.length;
    return avatars[index];
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <Card className="bg-trading-slate border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-white">Team Chat</CardTitle>
          <Link href="/chat">
            <Button variant="ghost" size="sm" className="text-trading-blue hover:text-blue-400" data-testid="link-view-all-chat">
              View All
            </Button>
          </Link>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Recent Messages */}
        <div className="space-y-4 max-h-80 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 py-4">
              No messages yet
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="flex space-x-3" data-testid={`preview-message-${message.id}`}>
                {message.sender === "System" ? (
                  <div className="w-8 h-8 bg-trading-blue rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">S</span>
                  </div>
                ) : (
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={getAvatarUrl(message.sender)} alt={message.sender} />
                    <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                      {getInitials(message.sender)}
                    </AvatarFallback>
                  </Avatar>
                )}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-white" data-testid={`preview-sender-${message.id}`}>
                      {message.sender}
                    </span>
                    <span className="text-xs text-gray-400" data-testid={`preview-time-${message.id}`}>
                      {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mt-1 break-words" data-testid={`preview-content-${message.id}`}>
                    {message.message.length > 100 
                      ? `${message.message.substring(0, 100)}...` 
                      : message.message
                    }
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quick Message Input */}
        <div className="pt-4 border-t border-gray-700">
          <form onSubmit={handleQuickMessage} className="flex space-x-2">
            <Input
              type="text"
              placeholder="Type a message..."
              value={quickMessage}
              onChange={(e) => setQuickMessage(e.target.value)}
              className="flex-1 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
              disabled={sendMessageMutation.isPending}
              data-testid="input-quick-message"
            />
            <Button
              type="submit"
              className="bg-trading-blue hover:bg-blue-600 text-white"
              disabled={!quickMessage.trim() || sendMessageMutation.isPending}
              data-testid="button-send-quick"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
