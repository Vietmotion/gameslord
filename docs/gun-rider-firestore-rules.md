# Gun Rider Firestore Rules

Use this rules block in Firebase Console > Firestore Database > Rules.
It adds authenticated access for Gun Rider multiplayer rooms with support for up to 6 participants per room.

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Existing collections (keep your current rules here)
    // ...

    match /gunRiderRooms/{roomCode} {
      function signedIn() {
        return request.auth != null;
      }

      function uid() {
        return request.auth.uid;
      }

      function participantKeys(data) {
        return ('participants' in data && data.participants is map)
          ? data.participants.keys()
          : [];
      }

      function participantsCount(data) {
        return participantKeys(data).size();
      }

      function selfEntryExists(data) {
        return uid() in participantKeys(data)
          && data.participants[uid()].uid == uid();
      }

      function isHostNow() {
        return resource.data.hostUid == uid();
      }

      function isParticipantNow() {
        return uid() in participantKeys(resource.data);
      }

      function participantSetUnchanged() {
        return participantKeys(request.resource.data).hasAll(participantKeys(resource.data))
          && participantKeys(resource.data).hasAll(participantKeys(request.resource.data));
      }

      function leavingSelfOnly() {
        return isParticipantNow()
          && !(uid() in request.resource.data.participants)
          && participantsCount(request.resource.data) == participantsCount(resource.data) - 1;
      }

      function joiningSelfOnly() {
        return !isParticipantNow()
          && selfEntryExists(request.resource.data)
          && participantsCount(request.resource.data) == participantsCount(resource.data) + 1
          && participantKeys(request.resource.data).hasAll(participantKeys(resource.data))
          && participantsCount(request.resource.data) <= 6
          && request.resource.data.status == 'waiting'
          && request.resource.data.hostUid == resource.data.hostUid
          && request.resource.data.code == resource.data.code
          && ('readyByUid' in request.resource.data)
          && (request.resource.data.readyByUid is map)
          && uid() in request.resource.data.readyByUid
          && request.resource.data.readyByUid[uid()] == false;
      }

      // Any signed-in user can read room state.
      allow read: if signedIn();

      // Room creation: creator must set themselves as host and first participant.
      allow create: if signedIn()
        && request.resource.data.hostUid == uid()
        && request.resource.data.guestUid == null
        && request.resource.data.status == 'waiting'
        && selfEntryExists(request.resource.data)
        && participantsCount(request.resource.data) == 1;

      // Updates:
      // - host can update room freely
      // - existing participant can update while remaining in room
      // - existing participant can remove only self (leave room)
      // - new authenticated user can add only self as a participant (join room)
      allow update: if signedIn() && (
        isHostNow()
        || (isParticipantNow() && selfEntryExists(request.resource.data) && participantSetUnchanged())
        || leavingSelfOnly()
        || joiningSelfOnly()
      );

      // Optional: only host can delete room.
      allow delete: if signedIn() && isHostNow();
    }
  }
}
```

If your project already has strict rules for scores, merge this match block under your existing top-level rules instead of replacing everything.

## Quick verification

1. Publish rules in Firebase Console.
2. Reload Gun Rider for all players.
3. Sign in with Google in the multiplayer panel.
4. Create one room and join from 3+ different accounts.
5. Confirm join status shows player count increasing (for example 3/6, 4/6).
