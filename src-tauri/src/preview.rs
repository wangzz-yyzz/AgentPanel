use std::{
    collections::HashMap,
    io::{Cursor, Read},
    path::Path,
};

use flate2::read::DeflateDecoder;
use quick_xml::{events::Event, reader::Reader};

use crate::{
    error::AppError,
    models::{PresentationPreviewSlide, SpreadsheetPreviewPayload},
};

const ZIP_LOCAL_FILE_HEADER: u32 = 0x0403_4b50;
const ZIP_CENTRAL_DIRECTORY_HEADER: u32 = 0x0201_4b50;
const ZIP_END_OF_CENTRAL_DIRECTORY: u32 = 0x0605_4b50;
const MAX_PREVIEW_ROWS: usize = 80;
const MAX_PREVIEW_COLUMNS: usize = 16;
const MAX_PRESENTATION_SLIDES: usize = 24;

#[derive(Debug, Clone)]
struct ZipEntry {
    offset: usize,
    compressed_size: usize,
    uncompressed_size: usize,
    compression_method: u16,
}

fn ensure_file_exists(path: &Path) -> Result<(), AppError> {
    if !path.exists() {
        return Err(AppError::message(format!(
            "File does not exist: {}",
            path.display()
        )));
    }
    if !path.is_file() {
        return Err(AppError::message(format!(
            "Path is not a file: {}",
            path.display()
        )));
    }
    Ok(())
}

fn parse_u16(slice: &[u8], offset: usize) -> Result<u16, AppError> {
    let bytes = slice
        .get(offset..offset + 2)
        .ok_or_else(|| AppError::message("Corrupted file structure."))?;
    Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
}

fn parse_u32(slice: &[u8], offset: usize) -> Result<u32, AppError> {
    let bytes = slice
        .get(offset..offset + 4)
        .ok_or_else(|| AppError::message("Corrupted file structure."))?;
    Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn read_zip_entries(bytes: &[u8]) -> Result<HashMap<String, ZipEntry>, AppError> {
    let eocd_index = bytes
        .windows(4)
        .rposition(|window| window == ZIP_END_OF_CENTRAL_DIRECTORY.to_le_bytes())
        .ok_or_else(|| AppError::message("Unable to locate archive directory."))?;

    let central_directory_size = parse_u32(bytes, eocd_index + 12)? as usize;
    let central_directory_offset = parse_u32(bytes, eocd_index + 16)? as usize;
    let central_directory = bytes
        .get(central_directory_offset..central_directory_offset + central_directory_size)
        .ok_or_else(|| AppError::message("Invalid archive directory."))?;

    let mut offset = 0usize;
    let mut entries = HashMap::new();

    while offset + 46 <= central_directory.len() {
        if parse_u32(central_directory, offset)? != ZIP_CENTRAL_DIRECTORY_HEADER {
            break;
        }

        let compression_method = parse_u16(central_directory, offset + 10)?;
        let compressed_size = parse_u32(central_directory, offset + 20)? as usize;
        let uncompressed_size = parse_u32(central_directory, offset + 24)? as usize;
        let file_name_length = parse_u16(central_directory, offset + 28)? as usize;
        let extra_field_length = parse_u16(central_directory, offset + 30)? as usize;
        let comment_length = parse_u16(central_directory, offset + 32)? as usize;
        let local_header_offset = parse_u32(central_directory, offset + 42)? as usize;

        let file_name_bytes = central_directory
            .get(offset + 46..offset + 46 + file_name_length)
            .ok_or_else(|| AppError::message("Invalid archive entry."))?;
        let file_name = String::from_utf8_lossy(file_name_bytes).replace('\\', "/");

        let local_header = bytes
            .get(local_header_offset..)
            .ok_or_else(|| AppError::message("Invalid local archive entry."))?;
        if parse_u32(local_header, 0)? != ZIP_LOCAL_FILE_HEADER {
            return Err(AppError::message("Archive entry header is invalid."));
        }
        let local_name_length = parse_u16(local_header, 26)? as usize;
        let local_extra_length = parse_u16(local_header, 28)? as usize;
        let data_offset = local_header_offset + 30 + local_name_length + local_extra_length;

        entries.insert(
            file_name,
            ZipEntry {
                offset: data_offset,
                compressed_size,
                uncompressed_size,
                compression_method,
            },
        );

        offset += 46 + file_name_length + extra_field_length + comment_length;
    }

    Ok(entries)
}

fn read_zip_entry(bytes: &[u8], entries: &HashMap<String, ZipEntry>, name: &str) -> Result<Vec<u8>, AppError> {
    let entry = entries
        .get(name)
        .ok_or_else(|| AppError::message(format!("Missing required archive member: {name}")))?;
    let payload = bytes
        .get(entry.offset..entry.offset + entry.compressed_size)
        .ok_or_else(|| AppError::message("Archive entry payload is truncated."))?;

    match entry.compression_method {
        0 => Ok(payload.to_vec()),
        8 => {
            let mut decoder = DeflateDecoder::new(Cursor::new(payload));
            let mut output = Vec::with_capacity(entry.uncompressed_size.max(payload.len()));
            decoder.read_to_end(&mut output)?;
            Ok(output)
        }
        method => Err(AppError::message(format!(
            "Unsupported archive compression method: {method}"
        ))),
    }
}

fn decode_xml_text(bytes: &[u8]) -> Result<String, AppError> {
    String::from_utf8(bytes.to_vec())
        .map_err(|_| AppError::message("Document XML uses an unsupported encoding."))
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn read_word_relationships(
    bytes: &[u8],
    entries: &HashMap<String, ZipEntry>,
) -> Result<HashMap<String, String>, AppError> {
    let rel_path = "word/_rels/document.xml.rels";
    let Some(_) = entries.get(rel_path) else {
        return Ok(HashMap::new());
    };

    let rel_xml = decode_xml_text(&read_zip_entry(bytes, entries, rel_path)?)?;
    let mut reader = Reader::from_str(&rel_xml);
    reader.config_mut().trim_text(true);
    let mut rels = HashMap::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(event)) | Ok(Event::Start(event))
                if event.name().as_ref().ends_with(b"Relationship") =>
            {
                let mut id = None;
                let mut target = None;
                for attr in event.attributes().flatten() {
                    match attr.key.as_ref() {
                        b"Id" => id = Some(String::from_utf8_lossy(attr.value.as_ref()).into_owned()),
                        b"Target" => {
                            target = Some(String::from_utf8_lossy(attr.value.as_ref()).replace('\\', "/"))
                        }
                        _ => {}
                    }
                }
                if let (Some(id), Some(target)) = (id, target) {
                    rels.insert(id, target);
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(AppError::message(format!("Unable to parse document relationships: {error}"))),
        }
        buf.clear();
    }

    Ok(rels)
}

pub fn read_docx_preview(path: &Path) -> Result<String, AppError> {
    ensure_file_exists(path)?;
    let bytes = std::fs::read(path)?;
    let entries = read_zip_entries(&bytes)?;
    let document_xml = decode_xml_text(&read_zip_entry(&bytes, &entries, "word/document.xml")?)?;
    let relationships = read_word_relationships(&bytes, &entries)?;

    let mut reader = Reader::from_str(&document_xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    let mut html = String::new();
    let mut paragraph = String::new();
    let mut in_paragraph = false;
    let mut in_table = false;
    let mut in_row = false;
    let mut cell = String::new();
    let mut row_cells: Vec<String> = Vec::new();
    let mut image_count = 0usize;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => match event.name().as_ref() {
                b"w:p" => {
                    paragraph.clear();
                    in_paragraph = true;
                }
                b"w:tbl" => {
                    html.push_str("<table class=\"preview-table\">");
                    in_table = true;
                }
                b"w:tr" => {
                    row_cells.clear();
                    in_row = true;
                }
                b"w:tc" => {
                    cell.clear();
                }
                b"a:blip" => {
                    for attr in event.attributes().flatten() {
                        if attr.key.as_ref().ends_with(b"embed") {
                            let rel_id = String::from_utf8_lossy(attr.value.as_ref()).into_owned();
                            if relationships.contains_key(&rel_id) {
                                image_count += 1;
                                if in_paragraph {
                                    if !paragraph.is_empty() {
                                        paragraph.push(' ');
                                    }
                                    paragraph.push_str(&format!("[Image {}]", image_count));
                                }
                            }
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::End(event)) => match event.name().as_ref() {
                b"w:p" => {
                    if in_paragraph {
                        let trimmed = paragraph.trim();
                        if !trimmed.is_empty() {
                            if in_table && in_row {
                                cell.push_str(trimmed);
                            } else {
                                html.push_str("<p>");
                                html.push_str(&escape_html(trimmed));
                                html.push_str("</p>");
                            }
                        }
                    }
                    paragraph.clear();
                    in_paragraph = false;
                }
                b"w:tc" => {
                    row_cells.push(cell.trim().to_string());
                    cell.clear();
                }
                b"w:tr" => {
                    html.push_str("<tr>");
                    for value in &row_cells {
                        html.push_str("<td>");
                        html.push_str(&escape_html(value));
                        html.push_str("</td>");
                    }
                    html.push_str("</tr>");
                    row_cells.clear();
                    in_row = false;
                }
                b"w:tbl" => {
                    html.push_str("</table>");
                    in_table = false;
                }
                _ => {}
            },
            Ok(Event::Text(event)) => {
                let text = event
                    .decode()
                    .map_err(|error| AppError::message(format!("Unable to decode document text: {error}")))?;
                if in_paragraph {
                    if !paragraph.is_empty() && !paragraph.ends_with(char::is_whitespace) {
                        paragraph.push(' ');
                    }
                    paragraph.push_str(text.as_ref());
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(AppError::message(format!("Unable to parse DOCX content: {error}"))),
        }
        buf.clear();
    }

    if html.trim().is_empty() {
        Ok("<p>This document is empty.</p>".to_string())
    } else {
        Ok(html)
    }
}

fn split_csv_line(line: &str, delimiter: char) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut chars = line.chars().peekable();
    let mut in_quotes = false;

    while let Some(ch) = chars.next() {
        if in_quotes {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                current.push(ch);
            }
            continue;
        }

        if ch == '"' {
            in_quotes = true;
        } else if ch == delimiter {
            values.push(current.trim().to_string());
            current.clear();
        } else {
            current.push(ch);
        }
    }

    values.push(current.trim().to_string());
    values
}

fn read_csv_preview(path: &Path, delimiter: char) -> Result<SpreadsheetPreviewPayload, AppError> {
    ensure_file_exists(path)?;
    let raw = std::fs::read(path)?;
    let text = String::from_utf8(raw)
        .map_err(|_| AppError::message("Spreadsheet text preview requires UTF-8 encoded CSV/TSV files."))?;
    let mut lines = text.lines();
    let columns = split_csv_line(lines.next().unwrap_or_default(), delimiter);
    let mut rows = Vec::new();
    let mut total_rows = 0usize;

    for line in lines {
      total_rows += 1;
      if rows.len() < MAX_PREVIEW_ROWS {
        let mut row = split_csv_line(line, delimiter);
        row.truncate(MAX_PREVIEW_COLUMNS);
        rows.push(row);
      }
    }

    Ok(SpreadsheetPreviewPayload {
        kind: "spreadsheet".to_string(),
        sheet_name: "Sheet1".to_string(),
        sheet_names: vec!["Sheet1".to_string()],
        total_rows,
        total_columns: columns.len(),
        columns: columns.into_iter().take(MAX_PREVIEW_COLUMNS).collect(),
        rows,
    })
}

fn parse_shared_strings(xml: &str) -> Result<Vec<String>, AppError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut strings = Vec::new();
    let mut current = String::new();
    let mut in_text = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                if event.name().as_ref() == b"t" {
                    in_text = true;
                }
            }
            Ok(Event::End(event)) => match event.name().as_ref() {
                b"t" => in_text = false,
                b"si" => {
                    strings.push(current.clone());
                    current.clear();
                }
                _ => {}
            },
            Ok(Event::Text(event)) if in_text => {
                let text = event
                    .decode()
                    .map_err(|error| AppError::message(format!("Unable to decode spreadsheet strings: {error}")))?;
                current.push_str(text.as_ref());
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(AppError::message(format!("Unable to parse shared strings: {error}"))),
        }
        buf.clear();
    }

    Ok(strings)
}

fn parse_workbook_sheets(xml: &str) -> Result<Vec<(String, String)>, AppError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut sheets = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(event)) | Ok(Event::Start(event)) if event.name().as_ref() == b"sheet" => {
                let mut name = None;
                let mut rel_id = None;
                for attr in event.attributes().flatten() {
                    match attr.key.as_ref() {
                        b"name" => name = Some(String::from_utf8_lossy(attr.value.as_ref()).into_owned()),
                        key if key.ends_with(b"id") => {
                            rel_id = Some(String::from_utf8_lossy(attr.value.as_ref()).into_owned())
                        }
                        _ => {}
                    }
                }
                if let (Some(name), Some(rel_id)) = (name, rel_id) {
                    sheets.push((name, rel_id));
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(AppError::message(format!("Unable to parse workbook sheets: {error}"))),
        }
        buf.clear();
    }

    Ok(sheets)
}

fn parse_relationship_targets(xml: &str) -> Result<HashMap<String, String>, AppError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut targets = HashMap::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(event)) | Ok(Event::Start(event))
                if event.name().as_ref().ends_with(b"Relationship") =>
            {
                let mut id = None;
                let mut target = None;
                for attr in event.attributes().flatten() {
                    match attr.key.as_ref() {
                        b"Id" => id = Some(String::from_utf8_lossy(attr.value.as_ref()).into_owned()),
                        b"Target" => {
                            target = Some(String::from_utf8_lossy(attr.value.as_ref()).replace('\\', "/"))
                        }
                        _ => {}
                    }
                }
                if let (Some(id), Some(target)) = (id, target) {
                    targets.insert(id, target);
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(AppError::message(format!("Unable to parse workbook relationships: {error}"))),
        }
        buf.clear();
    }

    Ok(targets)
}

fn column_index_from_ref(cell_ref: &str) -> usize {
    let mut value = 0usize;
    for ch in cell_ref.chars() {
        if !ch.is_ascii_alphabetic() {
            break;
        }
        value = value * 26 + (ch.to_ascii_uppercase() as usize - 'A' as usize + 1);
    }
    value.saturating_sub(1)
}

fn parse_worksheet_rows(xml: &str, shared_strings: &[String]) -> Result<(Vec<String>, Vec<Vec<String>>, usize, usize), AppError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    let mut rows_map: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut current_cell_ref = String::new();
    let mut current_cell_type = String::new();
    let mut current_value = String::new();
    let mut in_value = false;
    let mut total_rows = 0usize;
    let mut max_columns = 0usize;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => match event.name().as_ref() {
                b"row" => {
                    current_row.clear();
                    total_rows += 1;
                }
                b"c" => {
                    current_cell_ref.clear();
                    current_cell_type.clear();
                    current_value.clear();
                    for attr in event.attributes().flatten() {
                        match attr.key.as_ref() {
                            b"r" => current_cell_ref = String::from_utf8_lossy(attr.value.as_ref()).into_owned(),
                            b"t" => current_cell_type = String::from_utf8_lossy(attr.value.as_ref()).into_owned(),
                            _ => {}
                        }
                    }
                }
                b"v" | b"t" => {
                    in_value = true;
                    current_value.clear();
                }
                _ => {}
            },
            Ok(Event::End(event)) => match event.name().as_ref() {
                b"v" | b"t" => in_value = false,
                b"c" => {
                    let column_index = column_index_from_ref(&current_cell_ref);
                    if current_row.len() <= column_index {
                        current_row.resize(column_index + 1, String::new());
                    }
                    let value = if current_cell_type == "s" {
                        current_value
                            .parse::<usize>()
                            .ok()
                            .and_then(|index| shared_strings.get(index))
                            .cloned()
                            .unwrap_or_default()
                    } else {
                        current_value.trim().to_string()
                    };
                    current_row[column_index] = value;
                }
                b"row" => {
                    max_columns = max_columns.max(current_row.len());
                    if rows_map.len() < MAX_PREVIEW_ROWS + 1 {
                        let mut row = current_row.clone();
                        row.truncate(MAX_PREVIEW_COLUMNS);
                        rows_map.push(row);
                    }
                }
                _ => {}
            },
            Ok(Event::Text(event)) if in_value => {
                let text = event
                    .decode()
                    .map_err(|error| AppError::message(format!("Unable to decode worksheet value: {error}")))?;
                current_value.push_str(text.as_ref());
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(AppError::message(format!("Unable to parse worksheet rows: {error}"))),
        }
        buf.clear();
    }

    let mut rows_iter = rows_map.into_iter();
    let columns = rows_iter.next().unwrap_or_default();
    let rows: Vec<Vec<String>> = rows_iter.collect();
    Ok((columns, rows, total_rows.saturating_sub(1), max_columns))
}

pub fn read_spreadsheet_preview(path: &Path) -> Result<SpreadsheetPreviewPayload, AppError> {
    ensure_file_exists(path)?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    if extension == "csv" {
        return read_csv_preview(path, ',');
    }
    if extension == "tsv" {
        return read_csv_preview(path, '\t');
    }

    let bytes = std::fs::read(path)?;
    let entries = read_zip_entries(&bytes)?;
    let workbook_xml = decode_xml_text(&read_zip_entry(&bytes, &entries, "xl/workbook.xml")?)?;
    let workbook_rels =
        decode_xml_text(&read_zip_entry(&bytes, &entries, "xl/_rels/workbook.xml.rels")?)?;
    let relationships = parse_relationship_targets(&workbook_rels)?;
    let sheets = parse_workbook_sheets(&workbook_xml)?;
    let (sheet_name, rel_id) = sheets
        .first()
        .cloned()
        .ok_or_else(|| AppError::message("Spreadsheet does not contain any worksheets."))?;
    let sheet_names = sheets.iter().map(|(name, _)| name.clone()).collect::<Vec<_>>();
    let target = relationships
        .get(&rel_id)
        .cloned()
        .ok_or_else(|| AppError::message("Unable to resolve worksheet path."))?;
    let worksheet_path = if target.starts_with("xl/") {
        target
    } else {
        format!("xl/{target}")
    };

    let shared_strings = if entries.contains_key("xl/sharedStrings.xml") {
        let shared_strings_xml = decode_xml_text(&read_zip_entry(&bytes, &entries, "xl/sharedStrings.xml")?)?;
        parse_shared_strings(&shared_strings_xml)?
    } else {
        Vec::new()
    };

    let worksheet_xml = decode_xml_text(&read_zip_entry(&bytes, &entries, &worksheet_path)?)?;
    let (columns, rows, total_rows, total_columns) = parse_worksheet_rows(&worksheet_xml, &shared_strings)?;

    Ok(SpreadsheetPreviewPayload {
        kind: "spreadsheet".to_string(),
        sheet_name,
        sheet_names,
        columns,
        rows,
        total_rows,
        total_columns,
    })
}

fn parse_slide_xml(xml: &str) -> Result<(String, Vec<String>), AppError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut texts = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Text(event)) => {
                let text = event
                    .decode()
                    .map_err(|error| AppError::message(format!("Unable to decode slide text: {error}")))?;
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    texts.push(trimmed.to_string());
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(AppError::message(format!("Unable to parse slide XML: {error}"))),
        }
        buf.clear();
    }

    let title = texts.first().cloned().unwrap_or_else(|| "Untitled slide".to_string());
    let bullets = texts.into_iter().skip(1).take(8).collect::<Vec<_>>();
    Ok((title, bullets))
}

pub fn read_presentation_preview(path: &Path) -> Result<Vec<PresentationPreviewSlide>, AppError> {
    ensure_file_exists(path)?;
    let bytes = std::fs::read(path)?;
    let entries = read_zip_entries(&bytes)?;
    let mut slide_paths = entries
        .keys()
        .filter(|name| name.starts_with("ppt/slides/slide") && name.ends_with(".xml"))
        .cloned()
        .collect::<Vec<_>>();
    slide_paths.sort();

    let mut slides = Vec::new();
    for (index, slide_path) in slide_paths.into_iter().take(MAX_PRESENTATION_SLIDES).enumerate() {
        let slide_xml = decode_xml_text(&read_zip_entry(&bytes, &entries, &slide_path)?)?;
        let (title, bullets) = parse_slide_xml(&slide_xml)?;
        slides.push(PresentationPreviewSlide {
            index: index + 1,
            title,
            bullets,
            notes: None,
        });
    }

    Ok(slides)
}
