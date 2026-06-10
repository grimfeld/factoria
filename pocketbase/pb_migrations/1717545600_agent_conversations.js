/// <reference path="../pb_data/types.d.ts" />

/**
 * Persisted AI-assistant conversations (ADR-0010 follow-up).
 *
 * The Assistant page kept its history only in React state, so navigating away
 * or reloading lost it — past conversations could neither be viewed nor
 * restarted. This adds an owner-scoped `conversations` collection so each turn
 * can be saved and the history list rebuilt.
 *
 * Shape:
 *   title    — short label derived from the first user message (for the list)
 *   messages — the full OpenAI ChatMessage[] history (system/user/assistant/tool)
 *   mode     — the import mode selected for the conversation ("create-missing" |
 *              "extend-only"), so reopening restores the same setting
 *
 * Pending writes are intentionally NOT stored: they are an un-approved,
 * in-flight proposal tied to a live turn, not durable conversation content.
 * Reopening a conversation re-derives nothing destructive; the user re-asks to
 * regenerate a proposal.
 */

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const ownerRule = "@request.auth.id != '' && owner = @request.auth.id";

    const conversations = new Collection({
      type: "base",
      name: "conversations",
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: ownerRule,
      updateRule: ownerRule,
      deleteRule: ownerRule,
      fields: [
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "title", type: "text", required: true, max: 200 },
        // Full ChatMessage[] history. Large because tool messages embed import
        // rows; keep generous like topics.fields.
        { name: "messages", type: "json", required: true, maxSize: 2000000 },
        { name: "mode", type: "text", required: false, max: 40 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      // Newest-first listing per owner.
      indexes: [
        "CREATE INDEX idx_conversations_owner_updated ON conversations (owner, updated)",
      ],
    });
    app.save(conversations);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("conversations"));
    } catch (_) {
      // already gone
    }
  },
);
