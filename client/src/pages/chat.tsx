import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, Plus } from "lucide-react";
import { format } from "date-fns";

interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  timestamp: string;
  channelId: string;
  userId?: string;
}

export default function Chat() {
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [newChannel, setNewChannel] = useState<string>("");
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: channelsData } = useQuery({ queryKey: ["/api/chat/channels"] });
  const channels:any[] = (channelsData as any)?.data || [];
  const defaultChannel = channels[0]?.id || "";
  if (!selectedChannelId && defaultChannel) setSelectedChannelId(defaultChannel);
  const { data: chatData, isLoading } = useQuery({
    queryKey: ["/api/chat", selectedChannelId],
    queryFn: async () => (await apiRequest("GET", `/api/chat?channelId=${selectedChannelId}`)).json(),
    enabled: !!selectedChannelId,
    refetchInterval: 5000,
  });

  const messages: ChatMessage[] = (chatData as any)?.data || [];

  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: { sender: string; message: string; userId?: string }) => {
      await apiRequest("POST", "/api/chat", { ...messageData, channelId: selectedChannelId });
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
      scrollToBottom();
    },
    onError: (error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    sendMessageMutation.mutate({
      sender: user.name,
      message: newMessage.trim(),
      userId: user.id,
    });
  };

  const getAvatarUrl = (sender: string, userId?: string) => {
    // Generate consistent avatar URLs based on sender name
    const avatars = [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&w=150&h=150&fit=crop&crop=face",
      "https://images.unsplash.com/photo-1494790108755-2616b612b1e9?ixlib=rb-4.0.3&w=150&h=150&fit=crop&crop=face",
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&w=150&h=150&fit=crop&crop=face",
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&w=150&h=150&fit=crop&crop=face",
    ];
    
    if (sender === "System") return "";
    
    const index = sender.length % avatars.length;
    return avatars[index];
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-trading-dark">
      <Sidebar />
      
      <div className="flex-1 overflow-hidden flex flex-col">
        <TopBar />
        
        <main className="flex-1 overflow-hidden p-6">
          <Card className="h-full bg-trading-slate border-gray-700 flex flex-col">
            
<CardHeader className="border-b border-gray-700">
  <div className="flex items-center gap-4 mb-2">
    <div className="flex gap-2 overflow-x-auto">
      {channels.map((c:any)=>(
        <button
          key={c.id}
          onClick={()=>setSelectedChannelId(c.id)}
          className={`px-3 py-1 rounded-full text-sm border ${selectedChannelId===c.id? 'bg-trading-blue text-white border-trading-blue': 'text-gray-300 border-gray-600 hover:bg-gray-700'}`}
        >#{c.name}</button>
      ))}
    </div>
    <div className="ml-auto flex gap-2">
      <input
        value={newChannel}
        onChange={e=>setNewChannel(e.target.value)}
        placeholder="Nouveau canal"
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
      />
      <button
        onClick={async ()=>{ if(!newChannel.trim()) return; await apiRequest("POST","/api/chat/channels",{ name: newChannel.trim() }); setNewChannel(""); }}
        className="bg-trading-blue text-white rounded px-3 py-1 text-sm flex items-center gap-1"
      ><Plus className="w-4 h-4"/>Créer</button>
    </div>
  </div>
  <CardTitle className="flex items-center space-x-2 text-white">
    <Users className="w-5 h-5" />
    <span>Team Chat</span>
    <span className="text-sm text-gray-400 font-normal">
      ({messages.length} messages)
    </span>
  </CardTitle>
</CardHeader>

            
            <CardContent className="flex-1 flex flex-col p-0">
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {isLoading ? (
                  <div className="text-center text-gray-400">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-gray-400">No messages yet. Start the conversation!</div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className="flex space-x-3" data-testid={`message-${message.id}`}>
                      {message.sender === "System" ? (
                        <div className="w-8 h-8 bg-trading-blue rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">S</span>
                        </div>
                      ) : (
                        <Avatar>
                          <AvatarImage src={getAvatarUrl(message.sender, message.userId)} alt={message.sender} />
                          <AvatarFallback className="bg-gray-700 text-gray-300">
                            {getInitials(message.sender)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-white" data-testid={`sender-${message.id}`}>
                            {message.sender}
                          </span>
                          <span className="text-xs text-gray-400" data-testid={`timestamp-${message.id}`}>
                            {format(new Date(message.timestamp), 'MMM d, HH:mm')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300 mt-1" data-testid={`content-${message.id}`}>
                          {message.message}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="border-t border-gray-700 p-6">
                <form onSubmit={handleSubmit} className="flex space-x-2">
                  <Input
                    type="text"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                    disabled={sendMessageMutation.isPending}
                    data-testid="input-message"
                  />
                  <Button
                    type="submit"
                    className="bg-trading-blue hover:bg-blue-600 text-white"
                    disabled={!newMessage.trim() || sendMessageMutation.isPending}
                    data-testid="button-send"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
