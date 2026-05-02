export type Folder = {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
};

export type Note = {
  id: string;
  userId: string;
  folderId: string | null;
  title: string;
  content: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
};
