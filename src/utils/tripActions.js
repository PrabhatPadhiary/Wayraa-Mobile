import { showAlert } from '../components/AppDialog';

/** Edit / Delete menu for a trip (a bottom sheet, the same on iOS and Android). */
export function showTripActionMenu({ tripName, onEdit, onDelete }) {
  showAlert(tripName, undefined, [
    { text: 'Edit trip', onPress: onEdit },
    { text: 'Delete trip', style: 'destructive', onPress: onDelete },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

/** Confirm before permanently deleting a trip. Calls `onConfirm` on "Delete". */
export function confirmDeleteTrip(tripName, onConfirm) {
  showAlert(
    `Delete "${tripName}"?`,
    'This permanently removes the trip with its stops, saved places, expenses, checklist and itinerary for everyone on it. This can\'t be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]
  );
}

/**
 * The signed-in user's role on a trip: the server's `myRole`, or (for older
 * backends) their entry in the trip's member list.
 */
export function tripRole(trip, myUserId) {
  if (trip?.myRole) return String(trip.myRole).toLowerCase();
  const mine = (trip?.members || []).find((m) => myUserId && m.userId === myUserId);
  return (mine?.role || '').toLowerCase();
}
