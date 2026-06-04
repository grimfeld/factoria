/// <reference path="../pb_data/types.d.ts" />

/**
 * Factoria initial schema.
 *
 * Every content collection is owner-scoped: an `owner` relation to `users`,
 * locked by `@request.auth.id = owner` on all rules (ADR-0002). Signup is
 * closed — createRule on `users` is set to null (admin-only creation).
 *
 * Collections:
 *   records       — the unit of entry (subject + fact fields)
 *   review_state  — SRS memory, keyed by (record, factLabel) (ADR-0004)
 *   decks         — hand-picked Record collections
 *   templates     — reusable Record shapes (cookie cutters)
 *   images        — uploaded files referenced from TipTap JSON (ADR-0003)
 *
 * Tags are stored as a flat json string-array on `records` (filterable in
 * PocketBase via `tags ~ 'value'`); no separate Tag collection — a Tag exists
 * as soon as it is first used.
 */

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // Closed signup: no public create. Owner-only read/update of self.
    users.createRule = null;
    app.save(users);

    const ownerRule = "@request.auth.id != '' && owner = @request.auth.id";
    const ownerField = (collectionId) => ({
      name: "owner",
      type: "relation",
      required: true,
      maxSelect: 1,
      collectionId,
      cascadeDelete: true,
    });

    // PocketBase v0.23+ no longer auto-creates timestamps; add them explicitly
    // so the client can sort by `-created` (newest first).
    const timestamps = () => [
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ];

    const usersId = users.id;

    // ---- media ------------------------------------------------------------
    // Uploaded images and audio, referenced by id from a Field value (ADR-0007).
    const media = new Collection({
      type: "base",
      name: "media",
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: ownerRule,
      updateRule: ownerRule,
      deleteRule: ownerRule,
      fields: [
        ownerField(usersId),
        {
          name: "file",
          type: "file",
          required: true,
          maxSelect: 1,
          maxSize: 26214400, // 25 MB (audio can be larger than images)
          mimeTypes: [
            "image/png",
            "image/jpeg",
            "image/gif",
            "image/webp",
            "image/svg+xml",
            "audio/mpeg",
            "audio/ogg",
            "audio/wav",
            "audio/webm",
            "audio/mp4",
          ],
        },
        ...timestamps(),
      ],
    });
    app.save(media);

    // ---- templates --------------------------------------------------------
    const templates = new Collection({
      type: "base",
      name: "templates",
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: ownerRule,
      updateRule: ownerRule,
      deleteRule: ownerRule,
      fields: [
        ownerField(usersId),
        { name: "name", type: "text", required: true, max: 200 },
        // ordered list of field shapes: { label, type, tags[], decks[] }
        // (ADR-0008). No Title, no values.
        { name: "fields", type: "json", required: true, maxSize: 50000 },
        ...timestamps(),
      ],
    });
    app.save(templates);

    // ---- topics -----------------------------------------------------------
    // title: plain-text name, the prompt context for every Question (ADR-0005).
    // fields: ordered json array of typed Fields (ADR-0006/0007):
    //   { id, label, type: "text"|"image"|"audio", value, tags[], decks[] }
    // where value is a Markdown string (text) or a media id (image/audio), or
    // null for an empty Field. Tags and Deck membership live per Field (ADR-0008).
    const topics = new Collection({
      type: "base",
      name: "topics",
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: ownerRule,
      updateRule: ownerRule,
      deleteRule: ownerRule,
      fields: [
        ownerField(usersId),
        { name: "title", type: "text", required: true, max: 200 },
        { name: "fields", type: "json", required: true, maxSize: 2000000 },
        ...timestamps(),
      ],
      // Titles are unique per owner (ADR-0009).
      indexes: [
        "CREATE UNIQUE INDEX idx_topic_title_unique ON topics (owner, title)",
      ],
    });
    app.save(topics);

    const topicsId = topics.id;

    // ---- decks ------------------------------------------------------------
    const decks = new Collection({
      type: "base",
      name: "decks",
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: ownerRule,
      updateRule: ownerRule,
      deleteRule: ownerRule,
      fields: [
        ownerField(usersId),
        { name: "name", type: "text", required: true, max: 200 },
        // Field ids (ADR-0008). Field ids are app-level uuids living inside the
        // topics.fields JSON, not PocketBase record ids, so this is a json
        // string-array, not a relation. Membership cleanup on Field/Topic
        // deletion is done in app code.
        { name: "fields", type: "json", required: false, maxSize: 200000 },
        ...timestamps(),
      ],
    });
    app.save(decks);

    // ---- review_state -----------------------------------------------------
    // One row per studied Question, keyed by Field id (ADR-0006). The topic
    // relation is kept for owner-scoping and cascade-delete. Separate collection
    // from topic content so practice writes never collide with authoring writes
    // under last-write-wins sync (ADR-0004).
    const reviewState = new Collection({
      type: "base",
      name: "review_state",
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: ownerRule,
      updateRule: ownerRule,
      deleteRule: ownerRule,
      fields: [
        ownerField(usersId),
        {
          name: "topic",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: topicsId,
          cascadeDelete: true,
        },
        { name: "fieldId", type: "text", required: true, max: 200 },
        // SM-2-lite state. NOT required: PocketBase treats a required number
        // as blank when it is 0, but a fresh Question legitimately starts at
        // interval/reps/lapses = 0. Leaving them optional accepts 0 and
        // defaults a missing value to 0.
        { name: "interval", type: "number", required: false }, // days
        { name: "ease", type: "number", required: false }, // ease factor
        { name: "reps", type: "number", required: false },
        { name: "lapses", type: "number", required: false },
        { name: "due", type: "date", required: true },
        { name: "lastReviewed", type: "date", required: false },
        ...timestamps(),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_review_unique ON review_state (owner, fieldId)",
        "CREATE INDEX idx_review_due ON review_state (owner, due)",
      ],
    });
    app.save(reviewState);
  },
  (app) => {
    // rollback — delete in reverse dependency order
    for (const name of [
      "review_state",
      "decks",
      "topics",
      "templates",
      "media",
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        // already gone
      }
    }
    const users = app.findCollectionByNameOrId("users");
    users.createRule = "";
    app.save(users);
  },
);
