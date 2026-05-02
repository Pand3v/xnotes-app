import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Image as ImageExtension } from '@tiptap/extension-image';
import { Link as LinkExtension } from '@tiptap/extension-link';
import { Bold, Italic, Link as LinkIcon, Image as ImageIcon, Heading1, Heading2, List, ListOrdered, Undo, Redo, Palette } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { cn } from '../lib/utils';

interface EditorMenuProps {
  editor: Editor | null;
}

const EditorMenu = ({ editor }: EditorMenuProps) => {
  if (!editor) return null;

  const addImage = useCallback(() => {
    const url = window.prompt('URL da imagem:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL para o link:', previousUrl);
    if (url === null) {
      return;
    }
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const toggleColor = () => {
    const color = window.prompt('Digite o código hex ou nome da cor:', editor.getAttributes('textStyle').color || '#fb7185');
    if (color) {
      editor.chain().focus().setColor(color).run();
    }
  };

  const EditorBtn = ({ active, onClick, icon: Icon, title }: { active?: boolean, onClick: () => void, icon: any, title: string }) => (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "p-2 rounded-md transition-colors hover:bg-white/10 text-white/70 hover:text-white",
        active && "bg-[#FF8C94]/20 text-[#FF8C94]"
      )}
    >
      <Icon size={16} />
    </button>
  );

  return (
    <div className="flex flex-wrap gap-1 py-3 px-4 border-b border-white/10 bg-transparent sticky top-0 z-10 backdrop-blur-md">
      <EditorBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        icon={Bold}
        title="Negrito"
      />
      <EditorBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        icon={Italic}
        title="Itálico"
      />
      <div className="w-px h-6 bg-white/10 self-center mx-2" />
      <EditorBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        icon={Heading1}
        title="Título 1"
      />
      <EditorBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        icon={Heading2}
        title="Título 2"
      />
      <div className="w-px h-6 bg-white/10 self-center mx-2" />
      <EditorBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        icon={List}
        title="Lista de Marcadores"
      />
      <EditorBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        icon={ListOrdered}
        title="Lista Numerada"
      />
      <div className="w-px h-6 bg-white/10 self-center mx-2" />
      <div className="relative flex items-center justify-center">
        <input
          type="color"
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
          value={editor.getAttributes('textStyle').color || '#ffffff'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          title="Cor do Texto"
        />
        <div className="p-2 rounded-md transition-colors hover:bg-white/10 text-white/70 hover:text-white">
          <Palette size={16} />
        </div>
      </div>
      <EditorBtn onClick={setLink} active={editor.isActive('link')} icon={LinkIcon} title="Link" />
      <EditorBtn onClick={addImage} icon={ImageIcon} title="Adicionar Imagem" />
      <div className="flex-1" />
      <EditorBtn onClick={() => editor.chain().focus().undo().run()} icon={Undo} title="Desfazer" />
      <EditorBtn onClick={() => editor.chain().focus().redo().run()} icon={Redo} title="Refazer" />
    </div>
  );
};

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      ImageExtension.configure({
        HTMLAttributes: {
          class: 'rounded-lg border border-white/10 shadow-lg',
        },
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-[#FF8C94] underline decoration-[#FF8C94]/40 hover:decoration-[#FF8C94] transition-colors',
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content, false as any)
    }
  }, [content, editor]);

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      <EditorMenu editor={editor} />
      <div className="flex-1 overflow-y-auto p-4 scroll-smooth min-h-0">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
