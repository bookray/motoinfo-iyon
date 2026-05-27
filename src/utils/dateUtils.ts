
export const formatDate = (date: string | Date): string => {
  if (!date) return '';
  
  // If it's already in DD.MM.YYYY format, return as is
  if (typeof date === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
    return date;
  }

  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  
  return `${day}.${month}.${year}`;
};

export const formatDateTime = (date: string | Date): string => {
  if (!date) return '';
  
  // If it's already in DD.MM.YYYY HH:mm format, return as is
  if (typeof date === 'string' && /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/.test(date)) {
    return date;
  }

  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};
