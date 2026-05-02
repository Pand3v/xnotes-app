/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Folder as FolderIcon, FileText, Download, X, Search, LayoutGrid, Rows3, Settings, Menu, ChevronRight, LogIn, LogOut, Trash2, RotateCcw, Pin, PinOff, MessageSquare } from 'lucide-react';
import { RichTextEditor } from './components/RichTextEditor';
import { cn } from './lib/utils';
import type { Folder, Note } from './types';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [activeFolderId, setActiveFolderId] = useState<string | 'all' | 'trash' | 'pinned'>('all');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setFolders([]);
      setNotes([]);
      return;
    }

    const folderPath = `users/${user.uid}/folders`;
    const folderUnsub = onSnapshot(collection(db, 'users', user.uid, 'folders'), (snapshot) => {
      const loadedFolders: Folder[] = [];
      snapshot.forEach(doc => {
        loadedFolders.push(doc.data() as Folder);
      });
      setFolders(loadedFolders);
    }, (err) => handleFirestoreError(err, OperationType.LIST, folderPath));

    const notesPath = `users/${user.uid}/notes`;
    const noteUnsub = onSnapshot(collection(db, 'users', user.uid, 'notes'), (snapshot) => {
      const loadedNotes: Note[] = [];
      snapshot.forEach(doc => {
        loadedNotes.push(doc.data() as Note);
      });
      setNotes(loadedNotes);
    }, (err) => handleFirestoreError(err, OperationType.LIST, notesPath));

    return () => {
      folderUnsub();
      noteUnsub();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/unauthorized-domain') {
        alert("Erro: O domínio do Netlify não está autorizado no Firebase.\n\nPara corrigir: Acesse o Firebase Console > Authentication > Settings (Configurações) > Authorized domains (Domínios Autorizados) e adicione a URL do seu aplicativo.");
      } else {
        alert("Erro ao fazer login: " + err.message);
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const activeFolder = folders.find(f => f.id === activeFolderId);
  
  const filteredNotes = useMemo(() => {
    return notes
      .filter(n => {
        if (activeFolderId === 'trash') return n.isTrashed === true;
        if (n.isTrashed) return false;
        if (activeFolderId === 'pinned') return n.isPinned === true;
        return activeFolderId === 'all' ? true : n.folderId === activeFolderId;
      })
      .filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()) || n.content.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        if (activeFolderId !== 'pinned' && activeFolderId !== 'trash') {
          if (a.isPinned !== b.isPinned) {
            return a.isPinned ? -1 : 1;
          }
        }
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, activeFolderId, searchQuery]);

  const createFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !newFolderName.trim()) return;
    const name = newFolderName.trim();
    const id = uuidv4();
    const newFolder: Folder = { id, userId: user.uid, name, createdAt: Date.now() };
    const path = `users/${user.uid}/folders/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'folders', id), newFolder);
      setActiveFolderId(id);
      setIsFolderModalOpen(false);
      setNewFolderName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const createNote = async () => {
    if (!user) return;
    const id = uuidv4();
    const newNote: Note = {
      id,
      userId: user.uid,
      folderId: activeFolderId === 'all' || activeFolderId === 'trash' || activeFolderId === 'pinned' ? null : activeFolderId,
      title: 'Nota sem título',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isTrashed: false,
    };
    const path = `users/${user.uid}/notes/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'notes', id), newNote);
      if (activeFolderId === 'trash') {
        setActiveFolderId('all');
      }
      setEditingNoteId(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const trashNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    await updateNote(id, { isTrashed: true });
    if (editingNoteId === id) setEditingNoteId(null);
  };

  const restoreNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    await updateNote(id, { isTrashed: false });
  };

  const togglePinNote = async (id: string, currentPinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    await updateNote(id, { isPinned: !currentPinned });
  };

  const deleteNote = async (id: string, e: React.MouseEvent, confirmed = false) => {
    e.stopPropagation();
    if (!confirmed) {
      setNoteToDelete(id);
      return;
    }
    if (!user) return;
    const path = `users/${user.uid}/notes/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'notes', id));
      if (editingNoteId === id) setEditingNoteId(null);
      setNoteToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const deleteFolder = async (id: string, e: React.MouseEvent, confirmed = false) => {
    e.stopPropagation();
    if (!confirmed) {
      setFolderToDelete(id);
      return;
    }
    if (!user) return;
    const path = `users/${user.uid}/folders/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'folders', id));
      // Delete related notes
      const relatedNotes = notes.filter(n => n.folderId === id);
      for (const note of relatedNotes) {
        const notePath = `users/${user.uid}/notes/${note.id}`;
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'notes', note.id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, notePath);
        }
      }
      if (activeFolderId === id) setActiveFolderId('all');
      setFolderToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const exportNote = (note: Note, format: 'txt' | 'doc', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    let file: Blob;
    if (format === 'txt') {
      const temp = document.createElement('div');
      temp.innerHTML = note.content;
      const textContent = `${note.title}\n\n${temp.textContent || temp.innerText}`;
      file = new Blob([textContent], { type: 'text/plain' });
    } else {
      const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${note.title}</title></head>
        <body>
          <h1>${note.title}</h1>
          ${note.content}
        </body>
        </html>
      `;
      file = new Blob([htmlContent], { type: 'application/msword' });
    }
    
    const element = document.createElement('a');
    element.href = URL.createObjectURL(file);
    element.download = `${note.title || 'Sem_titulo'}.${format}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const updateNote = async (id: string, updates: Partial<Note>) => {
    if (!user) return;
    // Optimistic local update is handled by onSnapshot pulling data, but if we want instant we could set local state first
    const note = notes.find(n => n.id === id);
    if (!note) return;
    
    const updatedNote = { ...note, ...updates, updatedAt: Date.now() };
    const path = `users/${user.uid}/notes/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'notes', id), updatedNote);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };


  const editingNote = notes.find(n => n.id === editingNoteId);

  if (isLoading) {
    return (
      <div className="flex bg-[#121212] h-screen w-full items-center justify-center">
        <div className="text-[#FF8C94] animate-pulse">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full relative bg-[#121212] overflow-hidden items-center justify-center">
        <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] bg-[#FF8C94] opacity-10 rounded-full blur-[100px] pointer-events-none z-0"></div>
        <div className="absolute bottom-[-50px] left-[200px] w-[300px] h-[300px] bg-[#5a5a5a] opacity-20 rounded-full blur-[80px] pointer-events-none z-0"></div>
        <div className="z-10 flex flex-col items-center bg-white/5 backdrop-blur-xl border border-white/10 p-12 rounded-3xl shadow-2xl">
           <h1 className="text-4xl font-bold tracking-tighter uppercase text-[#FF8C94] flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-[#FF8C94] rounded-lg flex items-center justify-center text-[#121212] font-black italic">X</div>
            X Notes
          </h1>
          <p className="text-white/50 mb-8 max-w-sm text-center">O seu bloco de notas avançado sincronizado na nuvem.</p>
          <button 
            onClick={handleLogin}
            className="flex items-center gap-3 bg-white/10 hover:bg-white/15 px-6 py-3 rounded-full text-white font-medium border border-white/10 shadow-lg shadow-[#FF8C94]/5 transition-all duration-200 active:scale-95"
          >
            <LogIn size={18} className="text-[#FF8C94]" />
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full relative bg-[#121212] overflow-hidden">
      {/* Background Decorative Mesh stay hidden behind */}
      <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] bg-[#FF8C94] opacity-10 rounded-full blur-[100px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-50px] left-[200px] w-[300px] h-[300px] bg-[#5a5a5a] opacity-20 rounded-full blur-[80px] pointer-events-none z-0"></div>
      
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full shrink-0 flex flex-col border-r border-white/10 bg-white/5 backdrop-blur-xl z-20"
          >
            <div className="p-6 pb-2">
              <h1 className="text-xl font-bold tracking-tighter uppercase text-[#FF8C94] flex items-center gap-3 mb-10">
                <div className="w-8 h-8 bg-[#FF8C94] rounded flex items-center justify-center text-[#121212] font-black italic">X</div>
                X Notes
              </h1>
            </div>
            
            <div className="flex px-4 py-2 mt-4 space-x-2">
              <button 
                onClick={createNote}
                className="flex-1 glass-button py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium text-white shadow-lg"
              >
                <Plus size={16} /> Nova Nota
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
              <div className="space-y-1">
                <div 
                  className={cn("flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all", activeFolderId === 'all' ? "bg-white/10 shadow-lg shadow-[#FF8C94]/5 text-white" : "text-white/70 hover:text-white hover:bg-white/5")}
                  onClick={() => setActiveFolderId('all')}
                >
                  <FileText size={18} />
                  <span className="font-medium text-sm">Todas as Notas</span>
                  <span className="ml-auto text-xs bg-white/10 px-2 py-0.5 rounded-full">{notes.filter(n => !n.isTrashed).length}</span>
                </div>
                <div 
                  className={cn("flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all", activeFolderId === 'pinned' ? "bg-white/10 shadow-lg shadow-[#FF8C94]/5 text-white" : "text-white/70 hover:text-white hover:bg-white/5")}
                  onClick={() => setActiveFolderId('pinned')}
                >
                  <Pin size={18} />
                  <span className="font-medium text-sm">Fixadas</span>
                  <span className="ml-auto text-xs bg-white/10 px-2 py-0.5 rounded-full">{notes.filter(n => n.isPinned && !n.isTrashed).length}</span>
                </div>
                <div 
                  className={cn("flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all", activeFolderId === 'trash' ? "bg-white/10 shadow-lg shadow-[#FF8C94]/5 text-[#FF8C94]" : "text-white/70 hover:text-[#FF8C94] hover:bg-white/5")}
                  onClick={() => setActiveFolderId('trash')}
                >
                  <Trash2 size={18} />
                  <span className="font-medium text-sm">Lixeira</span>
                  <span className="ml-auto text-xs bg-white/10 px-2 py-0.5 rounded-full">{notes.filter(n => n.isTrashed).length}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between px-3 mb-2">
                  <span className="text-[10px] uppercase tracking-widest opacity-40">Pastas</span>
                  <button onClick={() => setIsFolderModalOpen(true)} className="text-[#FF8C94]/60 italic hover:text-[#FF8C94] transition-colors">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="space-y-1">
                  {folders.map(folder => {
                    const folderNotesCount = notes.filter(n => n.folderId === folder.id && !n.isTrashed).length;
                    return (
                      <div 
                        key={folder.id}
                        onClick={() => setActiveFolderId(folder.id)}
                        className={cn("group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm", activeFolderId === folder.id ? "bg-white/10 shadow-lg shadow-[#FF8C94]/5 text-white" : "text-white/70 hover:text-white hover:bg-white/5")}
                      >
                        <FolderIcon size={18} />
                        <span className="font-medium truncate flex-1 opacity-70">{folder.name}</span>
                        <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{folderNotesCount}</span>
                        <button 
                          onClick={(e) => deleteFolder(folder.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#FF8C94]/20 rounded text-[#FF8C94]/70 hover:text-[#FF8C94] transition-all ml-1"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-auto p-6 flex flex-col gap-4">
              <a 
                href="#" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/50 hover:text-white hover:bg-[#5865F2]/20 transition-all text-sm mb-2 border border-white/5"
              >
                <div className="w-6 h-6 bg-[#5865F2] rounded flex items-center justify-center text-white">
                  <MessageSquare size={14} />
                </div>
                <span className="font-medium">Comunidade Discord</span>
              </a>
              <div className="flex items-center justify-between text-white/50 text-xs px-2">
                <span className="truncate mr-2">{user?.email}</span>
                <button onClick={handleLogout} className="hover:text-[#FF8C94] transition-colors" title="Sair">
                  <LogOut size={14} />
                </button>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                <p className="text-[11px] opacity-60 mb-2 text-white">Armazenamento Usado</p>
                <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                  <div className="bg-[#FF8C94] h-full w-2/3"></div>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative z-10 transition-all duration-300">
        <header className="h-20 border-b border-white/10 bg-white/5 backdrop-blur-md flex items-center justify-between px-8 shrink-0">
          <div className="relative flex-1 max-w-md flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 -ml-2 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <Menu size={20} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
              <button 
                onClick={() => setViewMode('grid')}
                className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-[#FF8C94]/20 text-[#FF8C94]" : "text-white/40 hover:text-white")}
              >
                <LayoutGrid size={16} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-[#FF8C94]/20 text-[#FF8C94]" : "text-white/40 hover:text-white")}
              >
                <Rows3 size={16} />
              </button>
            </div>
            <button 
              onClick={createNote}
              className="bg-[#FF8C94] text-[#121212] px-6 py-2 rounded-full text-sm font-bold shadow-xl shadow-[#FF8C94]/20 hover:scale-105 transition-transform"
            >
              + Nova Nota
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="flex flex-col gap-6 mb-8">
            <div className="relative w-full max-w-2xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#FF8C94]/80" size={18} />
              <input 
                type="text" 
                placeholder="Buscar notas..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-12 text-sm focus:outline-none focus:border-[#FF8C94]/50 hover:bg-white/10 hover:border-white/20 transition-all text-white placeholder-white/40 font-sans shadow-inner shadow-[#FF8C94]/5"
              />
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold text-white tracking-tight">
                {activeFolderId === 'all' ? 'Todas as Notas' : activeFolderId === 'trash' ? 'Lixeira' : activeFolderId === 'pinned' ? 'Fixadas' : activeFolder?.name}
              </h2>
            </div>
          </div>
          
          {filteredNotes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
              <FileText size={48} className="opacity-20" />
              <p>Nenhuma nota encontrada nesta visualização.</p>
              <button onClick={createNote} className="text-rose-400 hover:text-rose-300 hover:underline">
                Crie sua primeira nota
              </button>
            </div>
          ) : (
            <div className={cn(
              viewMode === 'grid' 
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start" 
                : "flex flex-col gap-4 max-w-4xl mx-auto"
            )}>
              {filteredNotes.map(note => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={note.id}
                  onClick={() => setEditingNoteId(note.id)}
                  className={cn(
                    "group bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 cursor-pointer hover:-translate-y-1 transition-transform duration-300 relative overflow-hidden",
                    viewMode === 'grid' ? "min-h-[200px]" : "h-auto"
                  )}
                >
                  <div className={cn("p-6 flex flex-col h-full", viewMode === 'list' && "flex-row items-center gap-6")}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-widest opacity-40 mb-2 truncate">
                        {new Date(note.updatedAt).toLocaleDateString()}
                      </p>
                      <h3 className="font-bold text-lg mb-2 text-white truncate group-hover:text-[#FF8C94] transition-colors">
                        {note.title || 'Nota sem título'}
                      </h3>
                      <div 
                        className={cn("text-xs opacity-60 line-clamp-4 prose-sm prose-p:my-1", viewMode === 'list' && "line-clamp-2")}
                        dangerouslySetInnerHTML={{ __html: note.content || '<em>Nota vazia...</em>' }}
                      />
                    </div>
                    <div className={cn("mt-4 flex items-center justify-between text-xs text-white/50", viewMode === 'list' && "mt-0 shrink-0 w-48 flex-col items-end justify-center")}>
                      <span className="opacity-0"></span>
                      <div className="flex items-center gap-1 opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <div className="relative group/export inline-block">
                          <button onClick={(e) => exportNote(note, 'txt', e)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-[#FF8C94]">
                            <Download size={16} />
                          </button>
                          <div className="absolute bottom-full mb-1 right-0 bg-[#121212] rounded-lg shadow-xl border border-white/10 hidden group-hover/export:flex flex-col whitespace-nowrap overflow-hidden z-20">
                            <button onClick={(e) => exportNote(note, 'txt', e)} className="px-4 py-2 hover:bg-white/10 text-left text-white text-xs">Como .TXT</button>
                            <button onClick={(e) => exportNote(note, 'doc', e)} className="px-4 py-2 hover:bg-white/10 text-left text-white text-xs border-t border-white/10">Como .DOC</button>
                          </div>
                        </div>
                        {activeFolderId === 'trash' ? (
                          <>
                            <button onClick={(e) => restoreNote(note.id, e)} className="p-2 hover:bg-[#FF8C94]/20 rounded-lg text-[#FF8C94]" title="Restaurar Nota">
                              <RotateCcw size={16} />
                            </button>
                            <button onClick={(e) => deleteNote(note.id, e)} className="p-2 hover:bg-red-500/20 rounded-lg text-red-400" title="Excluir Definitivamente">
                              <Trash2 size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={(e) => togglePinNote(note.id, !!note.isPinned, e)} className={cn("p-2 rounded-lg transition-colors", note.isPinned ? "bg-[#FF8C94]/20 text-[#FF8C94]" : "hover:bg-white/10 text-white/50 hover:text-white")} title={note.isPinned ? "Desfixar" : "Fixar"}>
                              {note.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                            </button>
                            <button onClick={(e) => trashNote(note.id, e)} className="p-2 hover:bg-red-500/20 rounded-lg text-white/50 hover:text-red-400" title="Mover para Lixeira">
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Editor Modal */}
      <AnimatePresence>
        {editingNote && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#121212]/80 backdrop-blur-sm flex items-center justify-center p-4 lg:p-8"
          >
            <motion.div 
              initial={{ y: 50, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 20, scale: 0.95 }}
              className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 lg:p-8 border-b border-white/10 bg-white/5 gap-4 shrink-0">
                <input 
                  type="text" 
                  value={editingNote.title}
                  onChange={e => updateNote(editingNote.id, { title: e.target.value })}
                  className="bg-transparent border-none text-2xl font-bold text-[#FF8C94] focus:outline-none focus:ring-0 w-full sm:flex-1 placeholder-[#FF8C94]/50"
                  placeholder="Título da Nota"
                />
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto justify-end sm:ml-4">
                  
                  {/* Folder Selection Dropdown */}
                  <div className="relative">
                    <select
                      value={editingNote.folderId || 'all'}
                      onChange={(e) => updateNote(editingNote.id, { folderId: e.target.value === 'all' ? null : e.target.value })}
                      className="bg-white/5 border border-white/10 text-white/80 text-xs px-3 py-2 pr-8 rounded-lg focus:outline-none focus:border-[#FF8C94]/50 appearance-none hover:bg-white/10 transition-colors"
                    >
                      <option value="all" className="bg-[#121212]">Sem Pasta</option>
                      {folders.map(f => (
                        <option key={f.id} value={f.id} className="bg-[#121212]">{f.name}</option>
                      ))}
                    </select>
                    <FolderIcon size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
                  </div>

                  <div className="flex gap-2 items-center px-2">
                    <span className="text-[10px] text-white/40 uppercase font-bold px-2 hidden lg:inline-block">Salvar:</span>
                    <button 
                      onClick={() => exportNote(editingNote, 'doc')} 
                      className="text-[10px] font-black tracking-widest text-[#FF8C94] px-4 py-2 rounded-xl transition-all flex items-center gap-2 border-2 border-[#FF8C94]/60 shadow-[0_0_15px_rgba(255,140,148,0.3)] hover:shadow-[0_0_25px_rgba(255,140,148,0.8)] hover:bg-[#FF8C94]/20 hover:border-[#FF8C94] bg-transparent"
                    >
                       <Download size={14} className="hidden sm:block" /> <span>DOC</span>
                    </button>
                    <button 
                      onClick={() => exportNote(editingNote, 'txt')} 
                      className="text-[10px] font-black tracking-widest text-[#b48cff] px-4 py-2 rounded-xl transition-all flex items-center gap-2 border-2 border-[#b48cff]/60 shadow-[0_0_15px_rgba(180,140,255,0.3)] hover:shadow-[0_0_25px_rgba(180,140,255,0.8)] hover:bg-[#b48cff]/20 hover:border-[#b48cff] bg-transparent"
                    >
                       <Download size={14} className="hidden sm:block" /> <span>TXT</span>
                    </button>
                  </div>
                  {activeFolderId === 'trash' ? (
                    <button 
                      onClick={(e) => deleteNote(editingNote.id, e)}
                      className="flex items-center gap-2 p-2 sm:px-4 bg-red-500/20 hover:bg-red-500/40 rounded-full text-red-400 font-bold transition-all ml-2"
                      title="Excluir Definitivamente"
                    >
                      <Trash2 size={18} />
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={(e) => togglePinNote(editingNote.id, !!editingNote.isPinned, e)}
                        className={cn("flex items-center gap-2 p-2 sm:px-4 rounded-full font-bold transition-all ml-2", editingNote.isPinned ? "bg-[#FF8C94]/20 text-[#FF8C94]" : "bg-white/5 hover:bg-white/10 text-white/50 hover:text-white")}
                        title={editingNote.isPinned ? "Desfixar" : "Fixar"}
                      >
                        {editingNote.isPinned ? <PinOff size={18} /> : <Pin size={18} />}
                      </button>
                      <button 
                        onClick={(e) => trashNote(editingNote.id, e)}
                        className="flex items-center gap-2 p-2 sm:px-4 bg-white/5 hover:bg-red-500/20 rounded-full text-white/50 hover:text-red-400 font-bold transition-all ml-2"
                        title="Mover para Lixeira"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                  <button 
                    onClick={() => setEditingNoteId(null)}
                    className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-[#FF8C94] hover:bg-[#ff7a84] hover:scale-105 active:scale-95 rounded-full text-[#121212] font-bold transition-all shadow-lg shadow-[#FF8C94]/20 whitespace-nowrap ml-2"
                  >
                    <span className="hidden sm:inline">Voltar</span>
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-8 relative overflow-hidden flex flex-col">
                <RichTextEditor 
                  content={editingNote.content}
                  onChange={(content) => updateNote(editingNote.id, { content })}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFolderModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#121212]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white/10 border border-white/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white mb-4">Nova Pasta</h3>
              <form onSubmit={createFolder}>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Nome da pasta..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#FF8C94]/50 mb-6"
                />
                <div className="flex gap-3 justify-end">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsFolderModalOpen(false);
                      setNewFolderName('');
                    }}
                    className="px-4 py-2 text-white/50 hover:text-white transition-colors text-sm font-medium"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="bg-[#FF8C94] text-[#121212] px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-[#FF8C94]/20 hover:scale-105 transition-transform"
                  >
                    Criar Pasta
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {noteToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" 
            onClick={() => setNoteToDelete(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#121212] border border-white/10 p-6 rounded-2xl max-w-sm w-full shadow-2xl" 
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-white mb-2">Excluir permanentemente?</h3>
              <p className="text-white/60 mb-6 text-sm">Esta ação não pode ser desfeita e a nota será removida para sempre.</p>
              <div className="flex justify-end gap-3">
                <button className="px-4 py-2 font-medium text-white/70 hover:text-white" onClick={() => setNoteToDelete(null)}>Cancelar</button>
                <button className="px-4 py-2 font-medium bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30" onClick={(e) => deleteNote(noteToDelete, e, true)}>Excluir</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {folderToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" 
            onClick={() => setFolderToDelete(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#121212] border border-white/10 p-6 rounded-2xl max-w-sm w-full shadow-2xl" 
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-white mb-2">Excluir Pasta?</h3>
              <p className="text-white/60 mb-6 text-sm">Esta ação excluirá a pasta e <strong className="text-red-400">TODAS</strong> as notas contidas nela. Isso não pode ser desfeito.</p>
              <div className="flex justify-end gap-3">
                <button className="px-4 py-2 font-medium text-white/70 hover:text-white" onClick={() => setFolderToDelete(null)}>Cancelar</button>
                <button className="px-4 py-2 font-medium bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30" onClick={(e) => deleteFolder(folderToDelete, e, true)}>Excluir Pasta</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default App;
