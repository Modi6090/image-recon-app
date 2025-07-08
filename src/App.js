import React, { useState } from 'react';
import './App.css';
import Tesseract from 'tesseract.js';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import stringSimilarity from 'string-similarity';

const fieldNames = [
  "Plant", "Batch", "Heat No.", "Report Type",
  "C", "Mn", "Si", "S", "P", "Al", "Al (Sol)",
  "Nb", "V", "Ti", "Cr", "Mo", "Cu", "Ni",
  "N", "B", "Ca", "Al/N", "Cu+Ni+Cr+Mo+V",
  "Nb+V+Ti", "Nb+V", "Cu+Ni", "CETIW", "CEPCM"
];

function App() {
  const initialFormState = fieldNames.reduce((acc, field) => {
    acc[field] = '';
    return acc;
  }, {});

  const [formData, setFormData] = useState(initialFormState);
  const [loading, setLoading] = useState(false);
  const [ocrText, setOcrText] = useState('');

  const handleInputChange = (e, field) => {
    setFormData({ ...formData, [field]: e.target.value });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();

    if (['jpg', 'jpeg', 'png'].includes(ext)) {
      runOCR(file);
    } else if (['xlsx', 'xls'].includes(ext)) {
      handleExcel(file);
    } else if (ext === 'docx') {
      handleWord(file);
    } else {
      alert("❌ Unsupported file type");
    }
  };

  const preprocessImage = (file) => {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = () => {
        img.src = reader.result;
      };

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx.scale(2, 2);

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const binarized = avg > 128 ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = binarized;
        }

        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      };

      reader.readAsDataURL(file);
    });
  };

  const runOCR = async (file) => {
    setLoading(true);
    const processedImage = await preprocessImage(file);

    Tesseract.recognize(processedImage, 'eng', {
      logger: m => console.log(m),
    })
      .then(({ data: { text } }) => {
        console.log("📝 OCR Result:\n", text);
        setOcrText(text);
        fillFromText(text);
        setLoading(false);
      })
      .catch(err => {
        console.error("OCR Failed:", err);
        setLoading(false);
      });
  };

  const handleExcel = async (file) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);
      const firstRow = json[0];

      const updatedData = { ...formData };
      fieldNames.forEach((field) => {
        if (firstRow[field] !== undefined) {
          updatedData[field] = String(firstRow[field]);
        }
      });

      setFormData(updatedData);
      alert('✅ Excel data extracted!');
    } catch (err) {
      console.error('❌ Excel parsing error:', err);
    }
  };

  const handleWord = (file) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const arrayBuffer = event.target.result;
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;
      console.log("📄 DOCX TEXT:\n", text);
      setOcrText(text);
      fillFromText(text);
    };
    reader.readAsArrayBuffer(file);
  };

  const fillFromText = (text) => {
    const updatedData = { ...formData };

    const normalize = (str) =>
      str.toLowerCase().replace(/[^a-z0-9]/g, '');

    const corrections = {
      "ai (sol)": "al (sol)",
      "ai": "al",
      "heatno": "heat no.",
      "reporttype": "report type"
    };

    let matches = 0;
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);

    for (let rawLine of lines) {
      const line = rawLine.replace(/[\s]+/g, ' ').replace(/[:,.\-]/g, ':');
      let [rawLabel, ...valParts] = line.split(':');
      if (!valParts.length) continue;
      let rawValue = valParts.join(':').trim();

      let cleanLabel = normalize(rawLabel.trim());
      if (corrections[cleanLabel]) {
        cleanLabel = normalize(corrections[cleanLabel]);
      }

      let bestField = null;
      let bestScore = 0;

      for (let field of fieldNames) {
        const score = stringSimilarity.compareTwoStrings(
          cleanLabel,
          normalize(field)
        );
        if (score > bestScore) {
          bestScore = score;
          bestField = field;
        }
      }

      if (bestScore > 0.5) {
        updatedData[bestField] = rawValue;
        matches++;
        console.log(`✅ Matched "${rawLabel}" ➝ ${bestField}: ${rawValue}`);
      } else {
        console.log(`❌ Unmatched Label: "${rawLabel}" (score: ${bestScore.toFixed(2)})`);
      }
    }

    setFormData(updatedData);

    if (matches === 0) {
      alert("⚠️ No fields matched. Try uploading a clearer image.");
    }
  };

  const handleSave = () => {
    console.log('✅ Final Form Data:', formData);
    alert('Form data saved! (check console)');
  };

  return (
    <div className="container">
      <h2>📄 File Upload & Auto Data Extraction</h2>

      <div className="file-upload">
        <label>Select Image / Excel / Word file:</label><br />
        <input type="file" accept=".png,.jpg,.jpeg,.xlsx,.xls,.docx" onChange={handleFileChange} />
        {loading && <p>🔄 Running OCR... Please wait.</p>}
      </div>

      <div className="form-grid">
        {fieldNames.map((field, idx) => (
          <div className="form-field" key={idx}>
            <label>{field}</label>
            <input
              type="text"
              value={formData[field]}
              onChange={(e) => handleInputChange(e, field)}
              placeholder={`Enter ${field}`}
            />
          </div>
        ))}
      </div>

      <button className="save-btn" onClick={handleSave}>💾 Save</button>

      {!loading && ocrText && (
        <div style={{
          marginTop: '30px',
          padding: '15px',
          background: '#f9f9f9',
          border: '1px solid #ccc',
          borderRadius: '8px'
        }}>
          <h4>🧾 Extracted OCR Text (Debug)</h4>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '400px',
            overflowY: 'auto',
            fontSize: '14px',
            color: '#333'
          }}>
            {ocrText}
          </pre>
        </div>
      )}

      {Object.values(formData).some(val => val) && (
        <div style={{ marginTop: '30px' }}>
          <h3>📋 Extracted Data Summary</h3>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px'
          }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'left' }}>Field</th>
                <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'left' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {fieldNames.map((field, i) => (
                <tr key={i}>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{field}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{formData[field] || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
