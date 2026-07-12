import api from './api';
import {Message, Conversation} from '../types';

export const chatService = {
  getConversations: () => api.get<Conversation[]>('/chat/conversations'),

  getMessages: (itemId: string) => api.get<Message[]>(`/chat/${itemId}`),

  sendMessage: (itemId: string, content: string) =>
    api.post<Message>('/chat', {itemId, content}),
};
