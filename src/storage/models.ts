export type ProcessingStatus = 'pending' | 'processing' | 'done' | 'error';

export interface RawContentRecord {
  id: string;
  source: string;
  account: string;
  title: string;
  content: string;
  publishDate: Date;  
  topicsStatus: ProcessingStatus;
}

export interface TopicRecord {
  id: string;
  processedContentId: string;
  name: string;
  content: string;
  keywords: string[];
}
