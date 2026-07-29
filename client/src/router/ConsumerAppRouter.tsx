import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import { Navigate, useRoutes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";

const Home = lazy(() => import("@/pages/consumer/ConsumerHomePage"));
const AccountPage = lazy(() => import("@/pages/account/AccountPage"));
const ConsumerNovelListPage = lazy(() => import("@/pages/consumer/ConsumerNovelListPage"));
const ConsumerNovelCreatePage = lazy(() => import("@/pages/consumer/ConsumerNovelCreatePage"));
const ConsumerSetupPage = lazy(() => import("@/pages/consumer/setup/ConsumerSetupPage"));
const ConsumerWorkspacePage = lazy(() => import("@/pages/consumer/ConsumerWorkspacePage"));
const ConsumerHelpPage = lazy(() => import("@/pages/consumer/ConsumerHelpPage"));
const ConsumerPrivacyPage = lazy(() => import("@/pages/consumer/ConsumerPrivacyPage"));
const ConsumerMaterialsPage = lazy(() => import("@/pages/consumer/ConsumerMaterialsPage"));

const consumerRoutes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "help", element: <ConsumerHelpPage /> },
      { path: "privacy", element: <ConsumerPrivacyPage /> },
      { path: "materials", element: <ConsumerMaterialsPage /> },
      { path: "novels", element: <ConsumerNovelListPage /> },
      { path: "novels/create", element: <ConsumerNovelCreatePage /> },
      { path: "novels/:id/setup", element: <ConsumerSetupPage /> },
      { path: "novels/:id/preview", element: <ConsumerWorkspacePage /> },
      { path: "novels/:id/edit", element: <ConsumerWorkspacePage /> },
      { path: "novels/:id/chapters/:chapterId", element: <ConsumerWorkspacePage /> },
      { path: "account", element: <AccountPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];

export default function ConsumerAppRouter() {
  return useRoutes(consumerRoutes);
}
