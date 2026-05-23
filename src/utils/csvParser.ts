import fs from 'fs';
import { parse } from 'csv-parse';

export interface CsvParseOptions {
  delimiter?: string;
  columns?: boolean;
  skipEmptyLines?: boolean;
  trim?: boolean;
}

/**
 * Parsuje plik CSV i zwraca tablicę obiektów
 * @param filePath Ścieżka do pliku CSV
 * @param options Opcje parsowania (domyślnie delimiter=';', columns=true)
 * @returns Promise<any[]> Tablica wierszy CSV
 */
export async function parseCsvFile(
  filePath: string,
  options: CsvParseOptions = {}
): Promise<any[]> {
  const defaultOptions = {
    delimiter: ';',
    columns: true,
    skipEmptyLines: true,
    trim: true,
    ...options
  };

  if (!fs.existsSync(filePath)) {
    throw new Error(`Plik nie istnieje: ${filePath}`);
  }

  const rows: any[] = [];

  try {
    const parser = fs.createReadStream(filePath).pipe(parse(defaultOptions));

    for await (const row of parser) {
      if (row.Name && row.Name.trim()) { // Skip empty rows
        rows.push(row);
      }
    }

    return rows;
  } catch (error) {
    throw new Error(`Błąd parsowania CSV: ${error}`);
  }
}