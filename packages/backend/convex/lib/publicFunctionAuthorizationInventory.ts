export type PublicFunctionAuthorizationMechanism =
  | "admin_exact_clerk_subject"
  | "authenticated_identity_current_workspace"
  | "provider_signature"
  | "public_published_read"

export type PublicFunctionKind = "action" | "httpAction" | "mutation" | "query"

export type PublicFunctionAuthorizationInventoryEntry = {
  authorization: PublicFunctionAuthorizationMechanism
  kind: PublicFunctionKind
  wrapper: string
}

/**
 * Reviewable authorization boundary for every public Convex function. Internal
 * functions are intentionally excluded because Convex prevents client access.
 */
export const PUBLIC_FUNCTION_AUTHORIZATION_INVENTORY = {
  "admin:createChangelogEntry": {
    authorization: "admin_exact_clerk_subject",
    kind: "mutation",
    wrapper: "adminMutation",
  },
  "admin:deleteChangelogEntry": {
    authorization: "admin_exact_clerk_subject",
    kind: "mutation",
    wrapper: "adminMutation",
  },
  "admin:getMetricsOverview": {
    authorization: "admin_exact_clerk_subject",
    kind: "query",
    wrapper: "adminQuery",
  },
  "admin:getDeletionJob": {
    authorization: "admin_exact_clerk_subject",
    kind: "query",
    wrapper: "adminQuery",
  },
  "admin:listDeletionJobs": {
    authorization: "admin_exact_clerk_subject",
    kind: "query",
    wrapper: "adminQuery",
  },
  "admin:listChangelogEntries": {
    authorization: "admin_exact_clerk_subject",
    kind: "query",
    wrapper: "adminQuery",
  },
  "admin:listFeatureRequests": {
    authorization: "admin_exact_clerk_subject",
    kind: "query",
    wrapper: "adminQuery",
  },
  "admin:publishChangelogEntry": {
    authorization: "admin_exact_clerk_subject",
    kind: "mutation",
    wrapper: "adminMutation",
  },
  "admin:retryDeletionJob": {
    authorization: "admin_exact_clerk_subject",
    kind: "mutation",
    wrapper: "adminMutation",
  },
  "admin:cancelDeletionJob": {
    authorization: "admin_exact_clerk_subject",
    kind: "mutation",
    wrapper: "adminMutation",
  },
  "admin:unpublishChangelogEntry": {
    authorization: "admin_exact_clerk_subject",
    kind: "mutation",
    wrapper: "adminMutation",
  },
  "admin:updateChangelogEntry": {
    authorization: "admin_exact_clerk_subject",
    kind: "mutation",
    wrapper: "adminMutation",
  },
  "admin:updateFeatureRequest": {
    authorization: "admin_exact_clerk_subject",
    kind: "mutation",
    wrapper: "adminMutation",
  },
  "billing/creemHttp:creemWebhook": {
    authorization: "provider_signature",
    kind: "httpAction",
    wrapper: "httpAction",
  },
  "billing/customer:createBillingPortal": {
    authorization: "authenticated_identity_current_workspace",
    kind: "action",
    wrapper: "customerAction",
  },
  "billing/customer:createCheckout": {
    authorization: "authenticated_identity_current_workspace",
    kind: "action",
    wrapper: "customerAction",
  },
  "billing/customer:getBillingOverview": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "customerQuery",
  },
  "billing/customer:upgradeSubscription": {
    authorization: "authenticated_identity_current_workspace",
    kind: "action",
    wrapper: "customerAction",
  },
  "categories:createCategory": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "categories:deleteCategory": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "categories:listCategories": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "categories:updateCategory": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "changelog:listPublishedEntries": {
    authorization: "public_published_read",
    kind: "query",
    wrapper: "publicQuery",
  },
  "digest/customer:getDailyDigestPreference": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "customerQuery",
  },
  "digest/customer:updateDailyDigestPreference": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "customerMutation",
  },
  "email/resendHttp:resendWebhook": {
    authorization: "provider_signature",
    kind: "httpAction",
    wrapper: "httpAction",
  },
  "featureRequests:createFeatureRequest": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "featureRequests:listMyFeatureRequests": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "keywords:createKeyword": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "keywords:deleteKeyword": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "keywords:getKeywordSummary": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "keywords:listKeywords": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "keywords:pauseKeyword": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "keywords:resumeKeyword": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "keywords:updateKeyword": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "mentions:getMention": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "mentions:listMentions": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "mentions:updateMentionStatus": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "onboarding:saveOnboardingConfiguration": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "savedViews:createSavedView": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "savedViews:deleteSavedView": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "savedViews:listSavedViews": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "savedViews:reorderSavedViews": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "savedViews:updateSavedView": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "settings:getSettings": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "settings:updateDigestPreferences": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "users:bootstrapCurrentUser": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "users:getCurrentUser": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "users:updateCurrentUser": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "workspaces:deleteAccount": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
  "workspaces:getAccountDeletionReadiness": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "workspaces:getAccountDeletionStatus": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "workspaces:getCurrentWorkspace": {
    authorization: "authenticated_identity_current_workspace",
    kind: "query",
    wrapper: "authenticatedQuery",
  },
  "workspaces:updateCurrentWorkspace": {
    authorization: "authenticated_identity_current_workspace",
    kind: "mutation",
    wrapper: "authenticatedMutation",
  },
} as const satisfies Record<string, PublicFunctionAuthorizationInventoryEntry>
