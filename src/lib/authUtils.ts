export function normalizeEmployeeIdentifier(input: string): string {
  let cleaned = (input || '').trim().toLowerCase();
  if (!cleaned) return '';
  if (!cleaned.includes('@')) {
    // If they typed just a username or handle like "sarah" or "john12"
    cleaned = `${cleaned}@employee.local`;
  } else {
    const parts = cleaned.split('@');
    if (!parts[1].includes('.')) {
      // If they typed something like "sarah@store"
      cleaned = `${cleaned}.com`;
    }
  }
  return cleaned;
}

export function formatDisplayName(emailOrIdentifier: string | null | undefined): string {
  if (!emailOrIdentifier) return '';
  if (emailOrIdentifier === 'johnjoshuaguiral12@gmail.com') return 'Owner';
  if (emailOrIdentifier.endsWith('@employee.local')) {
    return emailOrIdentifier.replace('@employee.local', '');
  }
  return emailOrIdentifier;
}
