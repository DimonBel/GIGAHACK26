import type { ComponentType } from "react";

import { AccountPage } from "@/features/account/AccountPage";
import { PermissionsPage } from "@/features/admin/PermissionsPage";
import { RoutingPage } from "@/features/admin/RoutingPage";
import { SecurityPage } from "@/features/admin/SecurityPage";
import { TemplatesPage } from "@/features/admin/TemplatesPage";
import { UsersPage } from "@/features/admin/UsersPage";
import { MeetingsListPage } from "@/features/meetings/MeetingsListPage";
import { MinutesPage } from "@/features/minutes/MinutesPage";
import { NewMeetingPage } from "@/features/new-meeting/NewMeetingPage";
import { MyTasksPage } from "@/features/tasks/MyTasksPage";
import type { Screen } from "@/shared/types/domain";

/** Page of every screen. Which cabinet may open which screen is in shared/config/cabinets.ts (TABS). */
export const SCREENS: Record<Screen, ComponentType> = {
  meetings: MeetingsListPage,
  new: NewMeetingPage,
  editor: MinutesPage,
  moms: MeetingsListPage,
  read: MinutesPage,
  tasks: MyTasksPage,
  users: UsersPage,
  roles: PermissionsPage,
  security: SecurityPage,
  templates: TemplatesPage,
  routing: RoutingPage,
  account: AccountPage,
};
