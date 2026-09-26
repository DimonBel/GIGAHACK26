import { MY_TASKS } from "@/mocks/tasks";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { DUE_TEXT, dueLabel, dueTone } from "@/shared/lib/date";
import { Checkbox, PageHeader, Panel } from "@/shared/ui";
import { useTasksStore } from "@/stores/tasks";

/** Participant: tasks assigned in the minutes, ticked off when done. */
export function MyTasksPage() {
  const t = useT();
  const { done, toggle } = useTasksStore();
  const open = MY_TASKS.filter((task) => !done.includes(task.id)).length;
  return (
    <>
      <PageHeader
        title={t.tasks}
        description={`${open} open · tasks assigned to you in approved minutes.`}
      />
      <Panel className="max-w-[880px] overflow-hidden">
        <ul className="divide-y divide-line-soft">
          {MY_TASKS.map((task) => {
            const isDone = done.includes(task.id);
            return (
              <li key={task.id}>
                <label className="flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-canvas">
                  <Checkbox checked={isDone} onChange={() => toggle(task.id)} className="mt-0.5" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn("text-body font-medium", isDone ? "text-subtle line-through" : "text-ink")}>
                      {task.text}
                    </span>
                    <span className="text-caption text-muted">{task.from}</span>
                  </span>
                  <span
                    className={cn(
                      "pt-0.5 text-small whitespace-nowrap tabular-nums",
                      isDone ? "text-subtle" : DUE_TEXT[dueTone(task.due)],
                    )}
                  >
                    {isDone ? "Done" : dueLabel(task.due)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
