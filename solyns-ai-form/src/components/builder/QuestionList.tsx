import { cn } from '@/lib/utils'
import type { DiscussionGuideQuestion } from '@/lib/types'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlignLeft,
  Type,
  List,
  ListFilter,
  Hash,
  Star,
  ThumbsUp,
  ToggleLeft,
  Gauge,
  FileText,
  Plus,
  GripVertical,
  Trash2,
  Mail,
  Phone,
  Link2,
  Calendar,
  Scale,
} from 'lucide-react'

const TYPE_ICONS: Record<string, React.ReactNode> = {
  long_text: <AlignLeft className="h-3.5 w-3.5" />,
  short_text: <Type className="h-3.5 w-3.5" />,
  multiple_choice: <List className="h-3.5 w-3.5" />,
  dropdown: <ListFilter className="h-3.5 w-3.5" />,
  yes_no: <ToggleLeft className="h-3.5 w-3.5" />,
  nps: <Gauge className="h-3.5 w-3.5" />,
  opinion_scale: <Star className="h-3.5 w-3.5" />,
  rating: <ThumbsUp className="h-3.5 w-3.5" />,
  number: <Hash className="h-3.5 w-3.5" />,
  statement: <FileText className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  url: <Link2 className="h-3.5 w-3.5" />,
  phone: <Phone className="h-3.5 w-3.5" />,
  date: <Calendar className="h-3.5 w-3.5" />,
  legal: <Scale className="h-3.5 w-3.5" />,
}

interface QuestionListProps {
  questions: DiscussionGuideQuestion[]
  selectedIndex: number
  onSelect: (index: number) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onDelete: (index: number) => void
  onAddClick: () => void
}

interface SortableRowProps {
  question: DiscussionGuideQuestion
  index: number
  selectedIndex: number
  onSelect: (index: number) => void
  onDelete: (index: number) => void
}

function SortableQuestionRow({
  question: q,
  index: i,
  selectedIndex,
  onSelect,
  onDelete,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: q.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : undefined,
    zIndex: isDragging ? 2 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(i)}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
        selectedIndex === i
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-foreground hover:bg-muted'
      )}
    >
      <button
        type="button"
        className={cn(
          'touch-none shrink-0 cursor-grab rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground active:cursor-grabbing',
          isDragging && 'cursor-grabbing'
        )}
        aria-label={`Drag to reorder question ${i + 1}`}
        onClick={e => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="shrink-0 text-muted-foreground">
        {TYPE_ICONS[q.type] || <AlignLeft className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {q.text || `Question ${i + 1}`}
      </span>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          onDelete(i)
        }}
        className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
        aria-label={`Delete question ${i + 1}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function QuestionList({
  questions,
  selectedIndex,
  onSelect,
  onReorder,
  onDelete,
  onAddClick,
}: QuestionListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = questions.findIndex(q => q.id === active.id)
    const newIndex = questions.findIndex(q => q.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(oldIndex, newIndex)
  }

  const sortableIds = questions.map(q => q.id)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/60 p-2">
        <button
          type="button"
          onClick={onAddClick}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary sm:text-sm"
        >
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Add question
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {questions.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No questions yet. Use Add question above.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {questions.map((q, i) => (
                  <SortableQuestionRow
                    key={q.id}
                    question={q}
                    index={i}
                    selectedIndex={selectedIndex}
                    onSelect={onSelect}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="border-t p-3">
        <button
          type="button"
          onClick={onAddClick}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          Add question
        </button>
      </div>
    </div>
  )
}
