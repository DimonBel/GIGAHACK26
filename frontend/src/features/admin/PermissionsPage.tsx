import { PERMISSIONS } from "@/mocks/admin";
import { CABINETS } from "@/shared/config/cabinets";
import { useT } from "@/shared/i18n";
import { Checkbox, PageHeader, Panel } from "@/shared/ui";
import { useAdminStore } from "@/stores/admin";

export function PermissionsPage() {
  const t = useT();
  const { permissions, togglePermission } = useAdminStore();
  return (
    <>
      <PageHeader title={t.roles} description="What each cabinet is allowed to do. Admin rights cannot be removed from the Admin cabinet." />
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line-soft bg-canvas text-sm font-medium text-muted">
              <th scope="col" className="px-5 py-2.5 font-medium">
                Permission
              </th>
              {CABINETS.map((c) => (
                <th key={c} scope="col" className="w-32 px-3 py-2.5 text-center font-medium">
                  {t[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {PERMISSIONS.map((label, row) => (
              <tr key={label} className="transition-colors hover:bg-canvas">
                <th scope="row" className="px-5 py-3 text-md font-normal">
                  {label}
                </th>
                {CABINETS.map((cabinet, column) => (
                  <td key={cabinet} className="px-3 py-3 text-center">
                    <Checkbox
                      checked={permissions[row]?.[column] ?? false}
                      disabled={column === 0}
                      onChange={() => togglePermission(row, column)}
                      aria-label={`${label} · ${t[cabinet]}`}
                      className="disabled:opacity-60"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
