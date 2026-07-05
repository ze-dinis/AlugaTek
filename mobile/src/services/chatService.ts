import api from './api';
import {Message, Conversation} from '../types';

export const chatService = {
  getConversations: () => api.get<Conversation[]>('/chat/conversations'),

  getMessages: (otherId: string) => api.get<Message[]>(`/chat/${otherId}`),

  sendMessage: (receiverId: string, content: string) =>
    api.post<Message>('/chat', {receiverId, content}),
};
