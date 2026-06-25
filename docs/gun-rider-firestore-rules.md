# Gun Rider Firestore Rules

Use this rules block in Firebase Console > Firestore Database > Rules.
It adds authenticated access for Gun Rider multiplayer rooms while keeping write scope limited.

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Existing collections (keep your current rules here)
    // ...

    match /gunRiderRooms/{roomCode} {
      // Any signed-in user can read room state.
      allow read: if request.auth != null;

      // Room creation: creator must set themselves as host.
      allow create: if request.auth != null
        && request.resource.data.hostUid == request.auth.uid
        && request.resource.data.guestUid == null
        && request.resource.data.status == 'waiting';

      // Room updates:
      // - host can update
      // - existing guest can update
      // - new guest can claim empty guest seat
      allow update: if request.auth != null && (
        resource.data.hostUid == request.auth.uid
        || resource.data.guestUid == request.auth.uid
        || (
          resource.data.guestUid == null
          && request.resource.data.guestUid == request.auth.uid
          && request.resource.data.hostUid == resource.data.hostUid
        )
      );

      // Optional: only host can delete room.
      allow delete: if request.auth != null
        && resource.data.hostUid == request.auth.uid;
    }
  }
}
```

If your project already has strict rules for scores, merge this match block under your existing top-level rules instead of replacing everything.

## Quick verification

1. Publish rules in Firebase Console.
2. Reload Gun Rider.
3. Sign in with Google in the multiplayer panel.
4. Click Create Room.
5. Confirm room meta changes to: Room XXXX • Host (Player 1).
