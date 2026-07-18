import api from './api';
import {Message, Conversation} from '../types';

export const chatService = {
  getConversations: () => api.get<Conversation[]>('/chat/conversations'),

  getMessages: (itemId: string, otherUserId: string) =>
    api.get<Message[]>(`/chat/${itemId}`, {params: {otherUserId}}),

  sendMessage: (itemId: string, content: string, receiverId?: string) =>
    api.post<Message>('/chat', {itemId, content, receiverId}),
};
