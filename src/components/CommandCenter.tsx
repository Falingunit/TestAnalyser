import * as React from "react"
import { useNavigate } from "react-router-dom"
import { FileText } from "lucide-react"
import { useAppStore } from "@/lib/store"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

export function CommandCenter() {
  const [open, setOpen] = React.useState(false)
  const { state } = useAppStore()
  const navigate = useNavigate()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const onSelect = (testId: string, questionId: string) => {
    setOpen(false)
    navigate(`/app/questions/${testId}/${questionId}`)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search tests..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Tests">
          {[...state.tests]
            .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime())
            .map((test) => (
              <CommandItem
                key={test.id}
              onSelect={() => {
                if (test.questions.length > 0) {
                  onSelect(test.id, test.questions[0].id)
                } else {
                  // Fallback to test detail if no questions
                  setOpen(false)
                  navigate(`/app/tests/${test.id}`)
                }
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              <span>{test.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
