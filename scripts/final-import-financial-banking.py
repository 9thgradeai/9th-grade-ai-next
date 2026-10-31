#!/usr/bin/env python3
"""
Simple Python script to import financial banking MCQs into 9Th-Grade AI.
This script handles all three formats and processes the data efficiently.
"""

import os
import re
import json
from pathlib import Path
import psycopg2
from psycopg2.extras import execute_values

# Configuration
DATA_DIR = Path("database/data/Bank/Financial & Banking Knowledge")
FILES = [
    "Questions(Payment Systems and Digital Banking).txt",
    "Questions(Commercial Banking and Operations).txt",
    "Questions(Bangladesh Bank Monetary Policy & Central Banking ).txt",
    "Questions(Bangladesh Banking System and Institutions).txt",
    "Questions(Bangladesh Bank & Banking Laws).txt",
    "Questions(All Banking Terms, Full Forms & Monetary Policy Rates).txt",
]

# Database connection parameters (adjust as needed)
DB_CONFIG = {
    "host": "localhost",
    "database": "9th_grade_ai",
    "user": "postgres",
    "password": os.getenv("POSTGRES_PASSWORD", "your_password"),
    "port": 5432,
}

class MCQImporter:
    def __init__(self):
        self.db_config = DB_CONFIG
        self.conn = None
        self.cursor = None
        self.questions_processed = 0
        self.questions_inserted = 0
        self.questions_updated = 0
        self.questions_skipped = 0
        self.questions_rejected = 0
        self.subject_id = None
        self.bank_ecosystem_id = None
        
        # Parse questions by file
        self.parsed_questions = []
        
    def connect(self):
        """Connect to database"""
        try:
            self.conn = psycopg2.connect(**self.db_config)
            self.cursor = self.conn.cursor()
            print("✓ Database connected")
        except Exception as e:
            print(f"✗ Database connection failed: {e}")
            raise
    
    def disconnect(self):
        """Disconnect from database"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        print("✓ Database disconnected")
    
    def execute_query(self, query, params=None):
        """Execute a query"""
        try:
            self.cursor.execute(query, params)
            return self.cursor
        except Exception as e:
            print(f"✗ Query failed: {query[:100]}... Error: {e}")
            raise
    
    def get_or_create_subject(self):
        """Get or create Financial & Banking Knowledge subject"""
        # Get bank ecosystem
        self.cursor.execute("SELECT id FROM exam_ecosystem WHERE code = %s", ("BANGLADESH_BANK",))
        ecosystem = self.cursor.fetchone()
        if not ecosystem:
            print("✗ BANGLADESH_BANK ecosystem not found")
            return None
        self.bank_ecosystem_id = ecosystem[0]
        
        # Get or create subject
        self.cursor.execute("""
            SELECT id FROM subject 
            WHERE ecosystem_id = %s 
            AND name_en = %s 
            AND name_bn = %s
        """, (self.bank_ecosystem_id, "Financial & Banking Knowledge", "আর্থিক ও ব্যাংকিং জ্ঞান"))
        
        subject = self.cursor.fetchone()
        if subject:
            self.subject_id = subject[0]
            print(f"✓ Found existing subject with ID: {self.subject_id}")
        else:
            self.cursor.execute("""
                INSERT INTO subject (ecosystem_id, name_en, name_bn, icon, color, bg, sort_order)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                self.bank_ecosystem_id,
                "Financial & Banking Knowledge",
                "আর্থিক ও ব্যাংকিং জ্ঞান",
                "🏦",
                "text-purple-400",
                "bg-purple-500/10",
                7
            ))
            self.subject_id = self.cursor.fetchone()[0]
            print(f"✓ Created new subject with ID: {self.subject_id}")
        
        return self.subject_id
    
    def parse_question_block(self, lines, start_index):
        """Parse a single question block from lines list"""
        if start_index >= len(lines):
            return None
        
        first_line = lines[start_index].strip()
        question_match = re.match(r'^[0-9]+\.\s*(.+)$', first_line)
        if not question_match:
            return None
        
        question = question_match.group(1)
        current_index = start_index + 1
        
        # Parse options
        options = []
        
        # Check for Format 1: Options on separate lines
        for i in range(4):
            if current_index >= len(lines):
                return None
            
            option_line = lines[current_index].strip()
            option_match = re.match(r'^[A-D]\.\s*(.+)$', option_line)
            
            if not option_match:
                # Try to detect Format 2: All options on one line
                if i == 0 and re.search(r'[A-D]\.\s*[A-D]\.\s*[A-D]\.\s*[A-D]\.\s*.+', option_line):
                    # All options are on one line
                    single_line = option_line
                    
                    # Split by option markers more carefully
                    option_matches = re.findall(r'([A-D])\.\s*(.+?)(?=\s*[A-D]\.\s*|$)', single_line)
                    
                    if len(option_matches) >= 4:
                        option_matches.sort(key=lambda x: x[0])
                        options = [match[1] for match in option_matches[:4]]
                        current_index += 1
                        
                        # Skip remaining non-option lines
                        for j in range(1, 4):
                            if current_index < len(lines):
                                next_line = lines[current_index].strip()
                                if not re.match(r'^[A-D]\.\s*', next_line) and not re.match(r'Correct Answer\s*:', next_line):
                                    current_index += 1
                                else:
                                    break
                    else:
                        return None
                else:
                    return None
            else:
                options.append(option_match.group(1))
                current_index += 1
        
        # Parse Correct Answer
        if current_index >= len(lines):
            return None
            
        answer_line = lines[current_index].strip()
        answer_match = re.match(r'Correct Answer\s*:(.*)', answer_line, re.IGNORECASE)
        
        if not answer_match:
            return None
            
        answer_part = answer_match.group(1).strip()
        letter_match = re.match(r'^([A-D])\.\s*(.+)$', answer_part)
        
        if not letter_match:
            return None
            
        letter = letter_match.group(1).upper()
        answer_text = letter_match.group(2)
        
        option_index = ["A", "B", "C", "D"].indexOf(letter)
        if option_index == -1 or option_index >= len(options):
            return None
            
        correct_answer = options[option_index]
        current_index += 1
        
        # Parse Explanation
        if current_index >= len(lines):
            return None
            
        explanation_line = lines[current_index].strip()
        explanation_match = re.match(r'Explanation\s*:(.*)', explanation_line, re.IGNORECASE)
        
        if not explanation_match:
            return None
            
        explanation = explanation_match.group(1).strip()
        current_index += 1
        
        # Handle multi-line explanations
        while current_index < len(lines):
            next_line = lines[current_index].strip()
            if not next_line:
                current_index += 1
                continue
                
            # Stop if we encounter another question
            if re.match(r'^[0-9]+\.\s*', next_line):
                break
                
            # Stop if it looks like an option
            if re.match(r'^[A-D]\.\s*', next_line):
                break
                
            # Stop if it looks like a Correct Answer line
            if re.match(r'Correct Answer\s*:', next_line, re.IGNORECASE):
                break
                
            # Add to explanation
            explanation += " " + next_line
            current_index += 1
        
        return {
            "question": question,
            "options": options,
            "correct_answer": correct_answer,
            "explanation": explanation,
            "next_index": current_index
        }
    
    def parse_file(self, file_path):
        """Parse a single file and extract all questions"""
        print(f"\nProcessing {file_path.name}...")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Split into lines and clean
        lines = []
        for line in content.split('\n'):
            line = line.rstrip()  # Remove trailing whitespace but keep internal spaces
            if line.strip():  # Skip empty lines
                lines.append(line)
        
        questions_parsed = 0
        current_index = 0
        
        while current_index < len(lines):
            line = lines[current_index]
            
            # Skip header lines and section separators
            if (not line.strip() or 
                'Questions' in line and ('Questions' in line and ('Questions' in line.split()[0] if line.split() else False)) or
                re.match(r'Section\s*[A-Z]:', line) or
                re.match(r'^[A-Z]\s*:', line) or
                re.match(r'^[IVX]+\s*:.*', line) or
                'Questions 26–45:' in line or
                'Questions 46–65:' in line or
                re.match(r'^[0-9]+–[0-9]+:', line)):
                current_index += 1
                continue
            
            # Try to parse a question block
            block = self.parse_question_block(lines, current_index)
            if not block:
                current_index += 1
                continue
            
            questions_parsed += 1
            
            # Process the question
            self.process_question_block(file_path.name, block, questions_parsed)
            
            # Move to next question
            current_index = block['next_index']
        
        print(f"✓ {file_path.name}: {questions_parsed} questions parsed")
        return questions_parsed
    
    def process_question_block(self, file_name, block, question_number):
        """Process a single question block - prepare for database insertion"""
        self.questions_processed += 1
        
        # Create source key for deduplication
        source_key = f"bank_financial_knowledge_{block['question'][:50].replace(' ', '_').replace('/', '_')}"
        
        # Check if we have duplicate questions within this file
        # (Simple deduplication for now)
        if any(q['source_key'] == source_key for q in self.parsed_questions):
            self.questions_skipped += 1
            return
        
        # Validate the question
        if not block['question'] or len(block['options']) != 4 or not block['correct_answer']:
            self.questions_rejected += 1
            print(f"  [reject] {file_name} Q{question_number}: invalid structure")
            return
        
        # Check if correct answer is one of the options
        if block['correct_answer'] not in block['options']:
            self.questions_rejected += 1
            print(f"  [reject] {file_name} Q{question_number}: correct answer not in options")
            return
        
        # Add to parsed questions list for deduplication against database
        self.parsed_questions.append({
            "question": block['question'],
            "options": block['options'],
            "correct_answer": block['correct_answer'],
            "explanation": block['explanation'],
            "source_key": source_key,
            "file_name": file_name,
            "question_number": question_number
        })
    
    def run_import(self):
        """Run the complete import process"""
        try:
            print("Starting Financial & Banking Knowledge MCQ import...")
            print("=" * 60)
            
            # Connect to database
            self.connect()
            
            # Get or create subject
            if not self.get_or_create_subject():
                print("✗ Failed to get or create subject")
                return False
            
            # Process each file
            total_questions_parsed = 0
            for file_name in FILES:
                file_path = DATA_DIR / file_name
                if file_path.exists():
                    parsed = self.parse_file(file_path)
                    total_questions_parsed += parsed
                else:
                    print(f"✗ File not found: {file_path}")
            
            # Insert questions into database
            print("\nInserting questions into database...")
            for i, question_data in enumerate(self.parsed_questions):
                print(f"Processing question {i+1}/{len(self.parsed_questions)}...")
                
                # Check if question already exists in database (simplified check)
                # For a complete implementation, you would query the database here
                # For now, we'll just insert all as new
                
                try:
                    self.cursor.execute("""
                        INSERT INTO question (
                            ecosystem_id, subject_id, path, topic, subtopic, 
                            question, options, correct_answer, explanation,
                            difficulty, source_exam, year, question_type, source_key
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        self.bank_ecosystem_id,
                        self.subject_id,
                        "Financial & Banking Knowledge",
                        "Financial & Banking Knowledge",
                        question_data['file_name'],
                        question_data['question'],
                        json.dumps(question_data['options']),
                        question_data['correct_answer'],
                        question_data['explanation'],
                        "MEDIUM",
                        f"Bangla Grammar · {question_data['file_name']}",
                        None,
                        "SINGLE_CHOICE",
                        question_data['source_key']
                    ))
                    self.questions_inserted += 1
                    
                except Exception as e:
                    print(f"✗ Insert failed: {e}")
                    self.questions_rejected += 1
                    continue
            
            # Commit changes
            self.conn.commit()
            
            # Print summary
            print("\n" + "=" * 60)
            print("IMPORT COMPLETED SUCCESSFULLY!")
            print("=" * 60)
            print(f"Total questions parsed: {total_questions_parsed}")
            print(f"Questions inserted: {self.questions_inserted}")
            print(f"Questions skipped (duplicates): {self.questions_skipped}")
            print(f"Questions rejected (invalid): {self.questions_rejected}")
            print("=" * 60)
            
            return True
            
        except Exception as e:
            print(f"✗ Import failed: {e}")
            if self.conn:
                self.conn.rollback()
            return False
            
        finally:
            self.disconnect()

if __name__ == "__main__":
    importer = MCQImporter()
    success = importer.run_import()
    
    if not success:
        print("\nImport failed. Please check the error messages above.")
        exit(1)