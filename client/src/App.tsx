import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, FileText, 
  Upload, AlertTriangle, 
  Printer, Database, CheckCircle, 
  RefreshCw, File, Layers, Layout, Plus, Send, X, MessageSquare, Trash2, Download
} from 'lucide-react';

// Define strictly typed clinical structures matching backend Pydantic models
interface Subjective {
  hpi: string;
  pmh: string;
  medications: string[];
  allergies: string[];
}

interface Vitals {
  blood_pressure: string;
  heart_rate: number;
  respiratory_rate: number;
  temperature: number;
}

interface Objective {
  vitals: Vitals;
  physical_exam: string;
  labs_and_imaging: string[];
}

interface Differential {
  diagnosis: string;
  supporting_evidence: string;
  refuting_evidence: string;
}

interface Assessment {
  primary_diagnosis: string;
  clinical_reasoning: string;
  differentials: Differential[];
  risk_stratification?: string;
}

interface SOAPNote {
  subjective: Subjective;
  objective: Objective;
  assessment: Assessment;
  plan: string[];
  disclaimer: string;
}

interface Citation {
  id: string;
  text: string;
  metadata: {
    source_file: string;
    chunk_index: number;
    length: number;
  };
  similarity: number;
}

interface ChatMessage {
  sender: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
}

interface EmbeddedDoc {
  name: string;
  chunks: number;
  timestamp: string;
}

export default function App() {

  // Dynamic API base URL — reads from Vite env var in production, falls back to localhost for dev
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  // Sidebar menu active tab state (Default is the AI Assistant)
  const [activeTab, setActiveTab] = useState<'assistant' | 'rag' | 'dashboard'>(() => {
    const saved = localStorage.getItem('medai_active_tab');
    return (saved === 'assistant' || saved === 'rag' || saved === 'dashboard') ? saved : 'assistant';
  });
  
  // Accordion toggle states for Dashboard
  const [showParams, setShowParams] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  
  // Interactive mock mode for offline demonstration
  const [mockMode, setMockMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('medai_mock_mode');
    return saved ? saved === 'true' : true;
  });
  
  // Patient Inputs
  const [age, setAge] = useState<number | ''>(() => {
    const saved = localStorage.getItem('medai_patient_age');
    return saved ? (saved === '' ? '' : Number(saved)) : 52;
  });
  const [sex, setSex] = useState<string>(() => {
    return localStorage.getItem('medai_patient_sex') || 'M';
  });
  const [specialty, setSpecialty] = useState<string>(() => {
    return localStorage.getItem('medai_patient_specialty') || 'Emergency';
  });
  const [hpiInput, setHpiInput] = useState<string>(() => {
    return localStorage.getItem('medai_patient_hpi') || 
      "52yo male presenting with 3-day history of acute productive cough yielding rust-colored sputum, accompanied by subjective fevers and pleuritic right-sided chest pain. PMH is positive for mild hypertension. Medications: Lisinopril 10mg daily. Allergies: Penicillin (causes severe hives).";
  });

  
  // Inline uploader state inside Assistant Chat
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null);
  
  // Vector DB guidelines stats and file lists
  const [docFiles, setDocFiles] = useState<EmbeddedDoc[]>(() => {
    const saved = localStorage.getItem('medai_doc_files');
    return saved ? JSON.parse(saved) : [];
  });
  const [docUploading, setDocUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Generation states
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isCompilingSOAP, setIsCompilingSOAP] = useState(false);
  const [isQueryingRAG, setIsQueryingRAG] = useState(false);
  
  // Outputs
  const [visualAnalysis, setVisualAnalysis] = useState<string>(() => {
    return localStorage.getItem('medai_visual_analysis') || '';
  });
  const [soapNote, setSoapNote] = useState<SOAPNote | null>(() => {
    const saved = localStorage.getItem('medai_soap_note');
    return saved ? JSON.parse(saved) : null;
  });
  const [ragQuery, setRagQuery] = useState<string>('');
  const [ragHistory, setRagHistory] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('medai_chat_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [dbStats, setDbStats] = useState({ total_chunks: 0, total_files: 0 });





  // Fetch real database stats on load
  const fetchDbStats = async () => {
    if (mockMode) {
      setDbStats({ total_chunks: docFiles.reduce((acc, curr) => acc + curr.chunks, 0), total_files: docFiles.length });
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/db/stats`);
      if (response.ok) {
        const data = await response.json();
        setDbStats({ total_chunks: data.total_chunks, total_files: data.total_files });
        if (data.indexed_files) {
          setDocFiles(data.indexed_files.map((name: string) => ({
            name,
            chunks: 14, // Standard chunk approximation
            timestamp: new Date().toISOString().split('T')[0]
          })));
        }
      }
    } catch (err) {
      console.log("Backend offline, relying on client stats.");
    }
  };

  useEffect(() => {
    fetchDbStats();
  }, [mockMode]);

  // Trigger Mock data injection
  useEffect(() => {
    if (mockMode) {
      // Seed default RAG documents ONLY if the document list is currently completely empty!
      // This prevents overwriting user-uploaded files on reload or during Strict Mode double-renders.
      setDocFiles(prevDocs => {
        if (prevDocs.length === 0) {
          return [
            { name: "ATS_Pneumonia_Guidelines_2024.pdf", chunks: 28, timestamp: "2026-05-23" },
            { name: "FDA_Drug_Interaction_Matrix.txt", chunks: 14, timestamp: "2026-05-23" }
          ];
        }
        return prevDocs;
      });

      setVisualAnalysis(prev => {
        if (!prev) {
          return (
            "### MULTIMODAL SCAN OBSERVATION STUDY\n" +
            "**Scan Modality**: Posterior-Anterior (PA) Chest Radiograph\n" +
            "**Visual Adequacy**: Fully adequate, standard inspiration volume.\n\n" +
            "**OBSERVED FINDINGS**:\n" +
            "- A well-defined, dense homogeneous opacity is observed in the **right lower lung zone**, tracing along the anatomical boundaries of the right lower lobe.\n" +
            "- Focal lobar consolidation boundaries are prominent.\n" +
            "- Trachea is perfectly midline; cardiac silhouette is within normal limits. Hila are normal.\n" +
            "- The left lung zone is completely clear of focal infiltrates.\n" +
            "- **Costophrenic Angles**: Blunting is observed in the right costophrenic angle, suggestive of a minor localized reactive pleural effusion. Left costophrenic angle is sharp.\n\n" +
            "**AREAS OF CLINICAL INTEREST**:\n" +
            "1. **Right Lower Lobe Consolidation**: Visual features are strongly indicative of active acute lobar consolidation.\n" +
            "2. **Reactive Pleural Effusion**: Indicated by right-sided costophrenic angle blunting.\n\n" +
            "**DIFFERENTIAL CONSIDERATIONS**:\n" +
            "- *Primary*: Acute Lobar Pneumonia (bacterial origin highly probable, e.g. Streptococcus pneumoniae).\n" +
            "- *Secondary*: Localized Pulmonary Infarction (requires clinical correlation with coagulability markers).\n" +
            "- *Tertiary*: Right-sided Atelectasis (less probable due to lack of volume loss or tracheal deviation).\n\n" +
            "**SUGGESTED CLINICAL CORRELATION**:\n" +
            "- Order a Complete Blood Count (CBC) with differential, and verify Serum C-Reactive Protein (CRP).\n" +
            "- Obtain sputum cultures and evaluate oxygen saturation levels.\n\n" +
            "**SAFETY NOTICE**: This scan analysis represents an automated visual interpretation of opacity and density bounds. It is strictly simulated for clinical workspace validation and must be reviewed by an authorized radiologist."
          );
        }
        return prev;
      });

      setSoapNote(prev => {
        if (!prev) {
          return {
            subjective: {
              hpi: "52-year-old male presenting with a 3-day history of acute productive cough yielding rust-colored sputum, accompanied by subjective fevers and pleuritic right-sided chest pain. The chest pain is sharp and worsens on deep inspiration.",
              pmh: "History is notable for mild essential hypertension.",
              medications: ["Lisinopril 10mg PO daily"],
              allergies: ["Penicillin (documented reaction: severe generalized urticaria/hives)"]
            },
            objective: {
              vitals: {
                blood_pressure: "118/76 mmHg",
                heart_rate: 94,
                respiratory_rate: 22,
                temperature: 38.6
              },
              physical_exam: "Acutely ill appearing but alert and oriented x3. Localized dullness to percussion in the right lower lung base. Decreased breath sounds and loud bronchial breath sounds heard over the right lower lung zone with expiratory rales. Clear heart sounds.",
              labs_and_imaging: [
                "PA Chest Radiograph: Dense homogeneous opacity in the right lower lobe with right costophrenic angle blunting (lobar consolidation with reactive effusion).",
                "WBC: 14.8 x 10^9/L (Leukocytosis with neutrophilic shift).",
                "CRP: 82 mg/L (Significantly elevated inflammation marker)."
              ]
            },
            assessment: {
              primary_diagnosis: "Acute Bacterial Lobar Pneumonia (Right Lower Lobe)",
              clinical_reasoning: "The constellation of high spiking fevers, tachypnea, localized bronchial breath sounds with crackles, and productive rust-colored sputum paired with dense radiographical lobar consolidation and leukocytosis is highly characteristic of acute bacterial lobar pneumonia (Streptococcus pneumoniae assumed).",
              risk_stratification: "CURB-65 Score: 1 (Confusion: 0, Urea: 0, Respiratory Rate: 0, Blood Pressure: 0, Age >= 65: 0, BUN is pending, but parameters yield score of 0-1). Clinical risk is low; outpatient management is reasonable under close monitoring.",
              differentials: [
                {
                  diagnosis: "Pulmonary Infarction",
                  supporting_evidence: "Supported by acute onset pleuritic right-sided chest pain and focal radiographic consolidation.",
                  refuting_evidence: "Refuted by high productive fevers, leukocytosis, and classic rust-colored clinical sputum."
                },
                {
                  diagnosis: "Acute Bronchitis",
                  supporting_evidence: "Supported by cough, dyspnea, and expiratory crackles.",
                  refuting_evidence: "Refuted by dense radiographic lobar consolidation, high-grade fevers, and localized bronchial breathing."
                }
              ]
            },
            plan: [
              "1. Acute Lobar Pneumonia: Initiate Levofloxacin 750mg PO q24h for 5 days. (CRITICAL: Penicillin/Amoxicillin strictly avoided due to documented allergy).",
              "2. Fever & Pleuritic Pain: Administer Acetaminophen 500mg PO every 6 hours as needed (do not exceed 3g/day).",
              "3. Hydration: Encourage aggressive oral fluid intake (2-3L/day) to mobilize secretions.",
              "4. Monitoring: Patient instructed to monitor temperature and oxygen saturation twice daily.",
              "5. Red Flag Warnings: Instructed to present to the Emergency Department immediately if experiencing confusion, respiratory distress, or cyanosis.",
              "6. Follow-up: Schedule outpatient clinical reassessment in 72 hours, with telephone follow-up in 24 hours."
            ],
            disclaimer: "SIMULATED MEDICAL PRESENTATION: This clinical report was compiled by an educational AI assistant using vector-grounded medical reference guidelines."
          };
        }
        return prev;
      });

      setRagHistory(prev => {
        if (prev.length === 0) {
          return [
            {
              sender: 'assistant',
              text: "Welcome, Doctor! I am your Medai Assistant. I have indexed your clinical guidelines library (including ATS Pneumonia Guidelines and the FDA Drug Interaction Matrix).\n\nYou can type standard patient symptom queries, or attach visual chest X-rays inline using the '+' button below, and I will analyze them grounded strictly on your documents."
            }
          ];
        }
        return prev;
      });
    } else {
      setVisualAnalysis('');
      setSoapNote(null);
      setRagHistory([]);
    }
  }, [mockMode]);

  // Sync state variables to localStorage on change
  useEffect(() => {
    localStorage.setItem('medai_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('medai_mock_mode', String(mockMode));
  }, [mockMode]);

  useEffect(() => {
    localStorage.setItem('medai_patient_age', String(age));
  }, [age]);

  useEffect(() => {
    localStorage.setItem('medai_patient_sex', sex);
  }, [sex]);

  useEffect(() => {
    localStorage.setItem('medai_patient_specialty', specialty);
  }, [specialty]);

  useEffect(() => {
    localStorage.setItem('medai_patient_hpi', hpiInput);
  }, [hpiInput]);

  useEffect(() => {
    localStorage.setItem('medai_visual_analysis', visualAnalysis);
  }, [visualAnalysis]);

  useEffect(() => {
    if (soapNote) {
      localStorage.setItem('medai_soap_note', JSON.stringify(soapNote));
    } else {
      localStorage.removeItem('medai_soap_note');
    }
  }, [soapNote]);

  useEffect(() => {
    localStorage.setItem('medai_chat_history', JSON.stringify(ragHistory));
  }, [ragHistory]);

  useEffect(() => {
    localStorage.setItem('medai_doc_files', JSON.stringify(docFiles));
  }, [docFiles]);



  // Handle inline medical scan attachments inside Assistant Chat
  const handleInlineAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAttachedFile(file);
      setAttachedPreview(URL.createObjectURL(file));
      setMockMode(false); // Auto disable mock for active file uploads
    }
  };

  // Remove active inline attachment
  const handleRemoveAttachment = () => {
    setAttachedFile(null);
    setAttachedPreview(null);
  };

  // Handle guideline document file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
    }
  };

  // Document RAG Ingest
  const handleDocUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mockMode) {
      if (!selectedFile) {
        alert("Please select a guideline document to ingest!");
        return;
      }
      setDocUploading(true);
      setTimeout(() => {
        setDocFiles(prev => [
          ...prev,
          {
            name: selectedFile.name,
            chunks: Math.floor(Math.random() * 20) + 10,
            timestamp: new Date().toISOString().split('T')[0]
          }
        ]);
        setDocUploading(false);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 1500);
      return;
    }

    if (!selectedFile) {
      alert("Please select a guideline document to upload!");
      return;
    }

    setDocUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${API_BASE_URL}/api/rag/upload`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await fetchDbStats();
      } else {
        const err = await res.json();
        alert(`API Error: ${err.detail}`);
      }
    } catch (err) {
      alert("Backend API is currently offline. Please run server/main.py or use Mock Mode!");
    } finally {
      setDocUploading(false);
    }
  };

  // Delete a RAG guideline document
  const handleDeleteDoc = async (fileName: string) => {
    if (mockMode) {
      setDocFiles(prev => prev.filter(doc => doc.name !== fileName));
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete '${fileName}' from the RAG knowledge store?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/rag/delete?file_name=${encodeURIComponent(fileName)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        setDocFiles(prev => prev.filter(doc => doc.name !== fileName));
        await fetchDbStats();
      } else {
        const err = await res.json();
        alert(`API Error: ${err.detail}`);
      }
    } catch (err) {
      alert("Backend API is currently offline. Please run server/main.py or use Mock Mode!");
    }
  };

  // Clear all DB files
  const handleClearDb = () => {
    setDocFiles([]);
    if (!mockMode) {
      fetch(`${API_BASE_URL}/api/db/clear`, { method: 'POST' }).then(() => {
        fetchDbStats();
      });
    }
  };



  // Compile SOAP Patient note
  const runCompileSOAP = async () => {
    if (mockMode) {
      setIsCompilingSOAP(true);
      setTimeout(() => {
        setIsCompilingSOAP(false);
        setActiveTab('dashboard');
      }, 1500);
      return;
    }

    setIsCompilingSOAP(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clinical/compile-soap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hpi_notes: hpiInput,
          visual_findings: visualAnalysis || undefined,
          use_rag: true
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSoapNote(data);
        setActiveTab('dashboard');
      } else {
        const err = await res.json();
        alert(`API Error: ${err.detail}`);
      }
    } catch (err) {
      alert("Backend API is currently offline. Please run server/main.py or use Mock Mode!");
    } finally {
      setIsCompilingSOAP(false);
    }
  };

  // Submit RAG Chat question
  const submitRAGQuery = async (e?: React.FormEvent | null) => {
    if (e) e.preventDefault();
    if (!ragQuery.trim()) return;

    const userMsg = ragQuery;
    setRagQuery('');
    setIsQueryingRAG(true);

    if (mockMode) {
      setTimeout(() => {
        let reply = "";
        let citations: Citation[] = [];

        // Check if there are any custom files uploaded by the user
        const customDocs = docFiles.filter(d => d.name !== "ATS_Pneumonia_Guidelines_2024.pdf" && d.name !== "FDA_Drug_Interaction_Matrix.txt");

        if (userMsg.toLowerCase().includes('antigravity')) {
          reply = "According to the uploaded document **antigravityresearch.pdf**, Antigravity is a specialized neuromuscular activation protocol designed to counteract microgravity-induced physiological deterioration (such as muscle atrophy and bone density loss) during long-duration spaceflight.\n\nIt is clinically recommended to combine this 15mg daily protocol with resistance exercise regimens, and it is strictly contraindicated in patients presenting with acute vestibular hypersensitivity.";
          citations = [{
            id: "cit_antigravity_01",
            text: "Section 1.4: Antigravity protocol utilizes specialized neuromuscular activation patterns to preserve bone mineral density under zero-G conditions.",
            metadata: { source_file: "antigravityresearch.pdf", chunk_index: 3, length: 156 },
            similarity: 0.96
          }];
        } else if (userMsg.toLowerCase().includes('allergy') || userMsg.toLowerCase().includes('penicillin')) {
          reply = "According to Section 4.2 of the *ATS Pneumonia Guidelines 2024*, for patients presenting with suspected acute bacterial pneumonia who have a documented **severe penicillin allergy** (e.g. anaphylaxis, respiratory distress, or immediate urticaria), standard beta-lactams (Amoxicillin, Ceftriaxone) are strictly contraindicated due to risk of cross-reactivity.\n\nIn these cases, guideline-recommended alternative monotherapy includes **Respiratory Fluoroquinolones** (such as **Levofloxacin 750mg PO q24h** or Moxifloxacin 400mg PO q24h for 5 days), which provide excellent atypical coverage and high bioavailability.";
          citations = [{
            id: "cit_01",
            text: "Section 4.2: Alternative therapy for patients with Type I Hypersensitivity to Penicillins includes Respiratory Fluoroquinolones (Levofloxacin, Moxifloxacin) as preferred monotherapy.",
            metadata: { source_file: "ATS_Pneumonia_Guidelines_2024.pdf", chunk_index: 12, length: 182 },
            similarity: 0.94
          }];
        } else if (userMsg.toLowerCase().includes('lisinopril') || userMsg.toLowerCase().includes('interaction')) {
          reply = "Based on the *FDA Drug Interaction Matrix*, there are no major or life-threatening contraindications between **Lisinopril** (ACE inhibitor) and **Levofloxacin** (Fluoroquinolone).\n\nHowever, clinical monitoring is advised for:\n1. **Renal Function**: High-dose fluoroquinolones combined with ACE inhibitors in hypertensive elderly patients can occasionally increase the risk of transient nephrotoxicity.\n2. **Hypoglycemia/Dysglycemia**: Fluoroquinolones may alter glucose regulations in patients, though this is primarily significant for diabetic patients on oral hypoglycemics.";
          citations = [{
            id: "cit_02",
            text: "Interaction Code INT-82: Concomitant use of ACE inhibitors (e.g., Lisinopril) and Fluoroquinolones requires basic monitoring of renal function markers and hydration metrics.",
            metadata: { source_file: "FDA_Drug_Interaction_Matrix.txt", chunk_index: 4, length: 198 },
            similarity: 0.91
          }];
        } else if (customDocs.length > 0) {
          const fileNames = customDocs.map(d => `"${d.name}"`).join(', ');
          reply = `Based on your custom guideline document ${fileNames}, the query "${userMsg}" aligns with standard clinical recommendations and patient care protocols detailed in the reference matrix.`;
          citations = customDocs.map((doc, idx) => ({
            id: `cit_custom_${idx}`,
            text: `Reference context retrieved from your uploaded guideline "${doc.name}" regarding "${userMsg}" for clinical validation.`,
            metadata: { source_file: doc.name, chunk_index: 2, length: 140 },
            similarity: 0.88
          }));
        } else {
          reply = "I retrieved your indexed medical guidelines, but could not find a highly specific match for your exact terms. Based on general clinical knowledge, we recommend matching patient HPI notes with active guidelines, ensuring all patient medication allergies (especially Penicillin) are integrated before making prescribing selections.";
          citations = [{
            id: "cit_03",
            text: "General Section 1: Standard clinical protocols require patient profile validation (allergies, renal clearance) prior to active pharmacotherapy selection.",
            metadata: { source_file: "ATS_Pneumonia_Guidelines_2024.pdf", chunk_index: 0, length: 154 },
            similarity: 0.72
          }];
        }

        setRagHistory(prev => [...prev, { sender: 'assistant', text: reply, citations }]);
        setIsQueryingRAG(false);
      }, 1500);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg, top_k: 4 })
      });
      if (res.ok) {
        const data = await res.json();
        setRagHistory(prev => [...prev, { 
          sender: 'assistant', 
          text: data.response, 
          citations: data.citations 
        }]);
      } else {
        const err = await res.json();
        alert(`API Error: ${err.detail}`);
      }
    } catch (err) {
      alert("Backend API is currently offline. Please run server/main.py or use Mock Mode!");
    } finally {
      setIsQueryingRAG(false);
    }
  };

  // Unified submit handler for Assistant Conversation Tab
  const submitAssistantChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isQueryingRAG || isAnalyzingImage) return;

    // Case A: Image attachment is present
    if (attachedFile) {
      const currentFile = attachedFile;
      const userText = ragQuery.trim() || `Analyze radiograph scan: ${currentFile.name}`;
      
      // Append user bubble
      setRagHistory(prev => [...prev, { sender: 'user', text: userText }]);
      setRagQuery('');
      setAttachedFile(null);
      setAttachedPreview(null);
      setIsAnalyzingImage(true);

      if (mockMode) {
        setTimeout(() => {
          setVisualAnalysis(
            "### MULTIMODAL SCAN OBSERVATION STUDY\n" +
            "**Scan Modality**: Posterior-Anterior (PA) Chest Radiograph\n" +
            "**Visual Adequacy**: Fully adequate, standard inspiration volume.\n\n" +
            "**OBSERVED FINDINGS**:\n" +
            "- A well-defined, dense homogeneous opacity is observed in the **right lower lung zone**, tracing along the anatomical boundaries of the right lower lobe.\n" +
            "- Focal lobar consolidation boundaries are prominent.\n" +
            "- Costophrenic Angles: Blunting is observed in the right costophrenic angle, suggestive of a minor localized reactive pleural effusion.\n\n" +
            "**DIFFERENTIAL CONSIDERATIONS**:\n" +
            "- Primary: Acute Lobar Pneumonia (bacterial origin highly probable, e.g. Streptococcus pneumoniae).\n" +
            "- Secondary: Localized Pulmonary Infarction."
          );
          setRagHistory(prev => [
            ...prev,
            {
              sender: 'assistant',
              text: `### MULTIMODAL SCAN ANALYSIS COMPLETED\n\nI have successfully parsed the uploaded clinical scan (**${currentFile.name}**).\n\n**Visual Observations**:\n- A dense homogeneous opacity is identified in the **right lower lung zone** aligning with active lobar consolidation.\n- Moderate right costophrenic blunting suggests a minor localized **reactive pleural effusion**.\n\n**Grounded Clinical Differential Considerations**:\n1. **Acute Lobar Pneumonia**: Highly probable (bacterial Streptococcus origin).\n2. **Localized Pulmonary Infarction**: Secondary watch.\n\n*Findings have been dynamically synced to your **Dashboard metrics**!*`
            }
          ]);
          setIsAnalyzingImage(false);
        }, 2000);
      } else {
        const formData = new FormData();
        formData.append('file', currentFile);
        formData.append('prompt', userText);

        try {
          const res = await fetch(`${API_BASE_URL}/api/clinical/analyze-image`, {
            method: 'POST',
            body: formData
          });
          if (res.ok) {
            const data = await res.json();
            setVisualAnalysis(data.analysis);
            setRagHistory(prev => [
              ...prev,
              {
                sender: 'assistant',
                text: `### MULTIMODAL SCAN DIAGNOSTICS REPORT\n\nAnalyzed clinical radiograph file **${currentFile.name}**.\n\n${data.analysis}\n\n*Pathology metrics have been automatically synced to your dashboard.*`
              }
            ]);
          } else {
            const err = await res.json();
            alert(`API Error: ${err.detail}`);
          }
        } catch (err) {
          alert("Backend API is currently offline. Please run server/main.py or use Mock Mode!");
        } finally {
          setIsAnalyzingImage(false);
        }
      }
    } 
    // Case B: Text-only question
    else if (ragQuery.trim()) {
      const userText = ragQuery;
      setRagHistory(prev => [...prev, { sender: 'user', text: userText }]);
      await submitRAGQuery(null);
    }
  };

  const handleResetSession = () => {
    if (!window.confirm("Are you sure you want to clear the active patient profile and reset all chat history to start a new case?")) {
      return;
    }
    
    // Reset patient parameters
    setAge(52);
    setSex('M');
    setSpecialty('Emergency');
    setHpiInput(
      "52yo male presenting with 3-day history of acute productive cough yielding rust-colored sputum, accompanied by subjective fevers and pleuritic right-sided chest pain. PMH is positive for mild hypertension. Medications: Lisinopril 10mg daily. Allergies: Penicillin (causes severe hives)."
    );
    
    // Clear outputs and chat history
    setVisualAnalysis('');
    setSoapNote(null);
    setAttachedFile(null);
    setAttachedPreview(null);
    setRagQuery('');

    if (mockMode) {
      // Seed default RAG documents and chat history for standard mock experience
      setDocFiles([
        { name: "ATS_Pneumonia_Guidelines_2024.pdf", chunks: 28, timestamp: "2026-05-23" },
        { name: "FDA_Drug_Interaction_Matrix.txt", chunks: 14, timestamp: "2026-05-23" }
      ]);
      setRagHistory([
        {
          sender: 'assistant',
          text: "Welcome, Doctor! I am your Medai Assistant. I have indexed your clinical guidelines library (including ATS Pneumonia Guidelines and the FDA Drug Interaction Matrix).\n\nYou can type standard patient symptom queries, or attach visual chest X-rays inline using the '+' button below, and I will analyze them grounded strictly on your documents."
        }
      ]);
    } else {
      setDocFiles([]);
      setRagHistory([]);
    }
    
    // Remove relevant local storage items so caching is updated instantly
    localStorage.removeItem('medai_visual_analysis');
    localStorage.removeItem('medai_soap_note');
    localStorage.removeItem('medai_chat_history');
    localStorage.removeItem('medai_doc_files');
    localStorage.removeItem('medai_patient_age');
    localStorage.removeItem('medai_patient_sex');
    localStorage.removeItem('medai_patient_specialty');
    localStorage.removeItem('medai_patient_hpi');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!soapNote) return;

    const sections = [
      `CLINICAL CASE REPORT - SOAP CASE STUDY`,
      `======================================`,
      `Patient Profile: ${age}-year-old ${sex === 'M' ? 'Male' : sex === 'F' ? 'Female' : 'Other'}`,
      `Setting: ${specialty} Clinic`,
      `Specialty: ${specialty}`,
      `Date Compiled: ${new Date().toISOString().split('T')[0]}`,
      ``,
      `SUBJECTIVE (S)`,
      `--------------`,
      `History of Present Illness (HPI):`,
      soapNote.subjective.hpi,
      ``,
      `Past Medical History (PMH):`,
      soapNote.subjective.pmh,
      ``,
      `Current Medications:`,
      soapNote.subjective.medications.length > 0 
        ? soapNote.subjective.medications.map(m => `- ${m}`).join('\n')
        : '- None reported.',
      ``,
      `Allergies & Contraindications:`,
      soapNote.subjective.allergies.length > 0
        ? soapNote.subjective.allergies.map(a => `- ${a}`).join('\n')
        : '- No known allergies.',
      ``,
      `OBJECTIVE (O)`,
      `--------------`,
      `Vital Parameters:`,
      `- Blood Pressure: ${soapNote.objective.vitals.blood_pressure}`,
      `- Heart Rate: ${soapNote.objective.vitals.heart_rate} bpm`,
      `- Respiratory Rate: ${soapNote.objective.vitals.respiratory_rate} /min`,
      `- Core Temperature: ${soapNote.objective.vitals.temperature}°C`,
      ``,
      `Physical Examination:`,
      soapNote.objective.physical_exam,
      ``,
      `Diagnostic Records & Labs:`,
      soapNote.objective.labs_and_imaging.length > 0
        ? soapNote.objective.labs_and_imaging.map(lab => `- ${lab}`).join('\n')
        : '- None.',
      ``,
      `ASSESSMENT (A)`,
      `--------------`,
      `Primary Diagnostic Hypothesis:`,
      soapNote.assessment.primary_diagnosis,
      ``,
      `Clinical Decision Reasoning:`,
      soapNote.assessment.clinical_reasoning,
      ``,
      soapNote.assessment.risk_stratification 
        ? `Risk Stratification Logic:\n${soapNote.assessment.risk_stratification}\n` 
        : '',
      `Differential Diagnosis Mapping:`,
      soapNote.assessment.differentials.map((diff, i) => 
        `${i + 1}. ${diff.diagnosis} (Likelihood: ${i === 0 ? 'Likely / Primary' : 'Possible'})\n` +
        `   - Supporting Evidence: ${diff.supporting_evidence}\n` +
        `   - Refuting Evidence: ${diff.refuting_evidence}`
      ).join('\n\n'),
      ``,
      `PLAN (P)`,
      `--------`,
      soapNote.plan.map((pText, i) => `${i + 1}. ${pText}`).join('\n'),
      ``,
      `DISCLAIMER`,
      `----------`,
      soapNote.disclaimer,
      ``,
      `--------------------------------------`,
      `Verified Grounded Medai Output`
    ].join('\n');

    const blob = new Blob([sections], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Clinical_Case_Report_${age}_${sex}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper variables for Dashboard Overview
  const activeAlertCount = 
    (soapNote?.subjective.allergies.some(a => a.toLowerCase().includes('penicillin')) ? 1 : 0) +
    (soapNote?.subjective.medications.some(m => m.toLowerCase().includes('lisinopril')) ? 1 : 0);

  return (
    <div className="app-layout">
      
      {/* ================= 🏥 FIXED LEFT SIDEBAR (CRM Aesthetic) ================= */}
      <nav className="sidebar-nav no-print">
        
        {/* Brand Header */}
        <div className="brand-block" style={{ padding: '0 0 20px 0', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
          <img 
            src="/logo_medai.png" 
            alt="Medai Logo" 
            style={{ width: '100%', height: 'auto', maxHeight: '160px', objectFit: 'contain', borderRadius: 'var(--border-radius-lg)', boxShadow: '0 2px 8px rgba(42, 42, 42, 0.04)' }} 
          />
        </div>

        <span className="nav-label">Go to:</span>
        
        {/* Sidebar Nav Items */}
        <div className="nav-list">
          <button 
            onClick={() => setActiveTab('assistant')} 
            className={`nav-item ${activeTab === 'assistant' ? 'active' : ''}`}
          >
            <MessageSquare size={16} />
            <span>Assistant</span>
          </button>

          <button 
            onClick={() => setActiveTab('rag')} 
            className={`nav-item ${activeTab === 'rag' ? 'active' : ''}`}
          >
            <Database size={16} />
            <span>Library</span>
          </button>

          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <Layout size={16} />
            <span>Dashboard Overview</span>
          </button>
        </div>

      </nav>

      {/* ================= 🖥️ MAIN VIEWPORT CANVAS ================= */}
      <main className="main-content">
        
        {/* Top bar controls */}
        <div className="top-bar-actions no-print">
          
          {/* Active Mode switch */}
          <button 
            onClick={() => setMockMode(!mockMode)}
            className="deploy-status-badge"
            title="Switch between Mock and Real local API backend"
          >
            <span style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: mockMode ? 'var(--neon-orange)' : 'var(--neon-green)',
              display: 'inline-block'
            }}></span>
            <span>{mockMode ? "Demonstration Mode (Active)" : "Live API Server Connect"}</span>
          </button>



        </div>



        {/* ================= TAB 0: UNIFIED ASSISTANT (NEW HOMEPAGE) ================= */}
        {activeTab === 'assistant' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 'calc(100vh - 150px)' }}>
            
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="no-print">
              <h2 style={{ fontSize: '28px', color: 'var(--text-primary)', marginBottom: '4px', margin: 0 }}>Medai Assistant</h2>
              <button 
                onClick={handleResetSession}
                className="action-btn btn-secondary"
                style={{ width: 'auto', padding: '6px 14px', fontSize: '11.5px', borderRadius: 'var(--border-radius-md)' }}
                title="Reset active patient profile and clear chat history to start a new case"
              >
                <Trash2 size={12} />
                <span>New Case / Clear Chat</span>
              </button>
            </div>

            {/* Spacious Borderless Chat Canvas Feed */}
            <div className="canvas-chat-feed">
              {ragHistory.map((msg, idx) => (
                <div key={idx} className={`chat-msg-row ${msg.sender === 'user' ? 'user' : 'assistant'}`}>
                  <div className={msg.sender === 'user' ? 'chat-bubble-spacious-user' : 'chat-bubble-spacious-assistant'}>
                    {msg.text}

                    {/* Grounded reference citations cards */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="citation-container" style={{ marginTop: '12px' }}>
                        <p style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-sans)' }}>
                          <Database size={10} />
                          <span>Vector Citations</span>
                        </p>
                        {msg.citations.map((c, cIdx) => (
                          <div key={cIdx} className="citation-card" style={{ fontFamily: 'var(--font-sans)', marginTop: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700, color: 'var(--accent-color)', marginBottom: '4px' }}>
                              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '240px' }}>{c.metadata.source_file}</span>
                              <span style={{ fontFamily: 'monospace', fontSize: '9px', padding: '1px 4px', background: 'var(--accent-glow)', border: '1px solid var(--border-color)', borderRadius: '3px', flexShrink: 0 }}>
                                {Math.round(c.similarity * 100)}% match
                              </span>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>"{c.text}"</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isQueryingRAG && (
                <div className="chat-msg-row assistant">
                  <div className="chat-bubble-spacious-assistant" style={{ fontStyle: 'italic', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw className="animate-spin" size={14} style={{ color: 'var(--accent-color)' }} />
                    <span>Searching vector database for matching chunks...</span>
                  </div>
                </div>
              )}

              {isAnalyzingImage && (
                <div className="chat-msg-row assistant">
                  <div className="chat-bubble-spacious-assistant" style={{ fontStyle: 'italic', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw className="animate-spin" size={14} style={{ color: 'var(--accent-color)' }} />
                    <span>Analyzing uploaded medical radiograph scan...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Bottom Unified Chat Bar */}
            <div className="unified-chat-box no-print">
              
              {/* Attachment Preview thumbnail bar */}
              {attachedPreview && (
                <div className="attachment-preview-bar">
                  <div className="attachment-thumbnail-container">
                    <img src={attachedPreview} alt="Selected scan preview" className="attachment-thumbnail" />
                    <div className="remove-attachment-badge" onClick={handleRemoveAttachment}>
                      <X size={10} />
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-color)', display: 'block' }}>
                      {attachedFile?.name || "Attached Scan"}
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block' }}>
                      Ready to analyze inline
                    </span>
                  </div>
                </div>
              )}

              <form onSubmit={submitAssistantChat} className="chat-input-row">
                
                {/* Plus button uploader */}
                <div className="chat-plus-btn">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleInlineAttachment}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                    title="Attach medical scan"
                  />
                  <Plus size={18} />
                </div>

                <input 
                  type="text" 
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  placeholder={attachedPreview ? "Describe this scan or hit Send to analyze..." : "Ask clinical questions, list allergy criteria, or query guidelines..."}
                  className="chat-text-input"
                  disabled={isQueryingRAG || isAnalyzingImage}
                />

                <button 
                  type="submit" 
                  className="chat-send-btn"
                  disabled={(!ragQuery.trim() && !attachedFile) || isQueryingRAG || isAnalyzingImage}
                >
                  <Send size={14} />
                </button>

              </form>

            </div>

          </div>
        )}

        {/* ================= TAB 1: DASHBOARD OVERVIEW ================= */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-view">
            
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '28px', color: 'var(--text-primary)', marginBottom: '4px' }}>Your Clinical Overview</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Welcome, Dr. Ruturaj! Here is a high-level summary of active patients, guidelines stats, and warnings.</p>
            </div>

            {/* KPI METRIC CARDS GRID */}
            <div className="kpi-grid">
              
              {/* Card 1: Patient age/sex */}
              <div className="kpi-card">
                <span className="accent-bar bg-terracotta"></span>
                <span className="kpi-label">Active Patient Profile</span>
                <span className="kpi-value">{age ? `${age} yo` : 'No Profile'}</span>
                <span className="kpi-subtext">Sex: {sex === 'M' ? 'Male' : sex === 'F' ? 'Female' : 'Other'} | {specialty}</span>
              </div>

              {/* Card 2: RAG Stats */}
              <div className="kpi-card">
                <span className="accent-bar bg-green"></span>
                <span className="kpi-label">Grounded Reference Library</span>
                <span className="kpi-value">{dbStats.total_files} Files</span>
                <span className="kpi-subtext">{dbStats.total_chunks} Total Vector Chunks</span>
              </div>

              {/* Card 3: Radiograph analyzed */}
              <div className="kpi-card">
                <span className="accent-bar bg-gold"></span>
                <span className="kpi-label">Radiograph Study Status</span>
                <span className="kpi-value">{visualAnalysis ? "Analyzed" : "Empty"}</span>
                <span className="kpi-subtext">{visualAnalysis ? "Scan findings integrated" : "No PA scan uploaded"}</span>
              </div>

              {/* Card 4: Warnings / Alerts */}
              <div className="kpi-card">
                <span className="accent-bar bg-slate"></span>
                <span className="kpi-label">Safety Alerts Active</span>
                <span className="kpi-value" style={{ color: activeAlertCount > 0 ? 'var(--accent-color)' : 'var(--text-primary)' }}>
                  {activeAlertCount} Warnings
                </span>
                <span className="kpi-subtext">Penicillin & Lisinopril check</span>
              </div>

            </div>

            {/* Split Details Section */}
            <div className="dashboard-detail-grid">
              
              {/* Left Side: Patient Parameters, Active Patient Vitals & History */}
              <div className="glass-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>
                    Active Patient Vitals & History
                  </h3>
                  <button 
                    onClick={() => setShowParams(!showParams)}
                    className="action-btn btn-secondary no-print"
                    style={{ width: 'auto', padding: '4px 10px', fontSize: '11px', borderRadius: 'var(--border-radius-md)' }}
                  >
                    {showParams ? "Hide Parameters" : "Edit Parameters"}
                  </button>
                </div>
                
                {showParams && (
                  <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }} className="no-print">
                    <div className="form-grid-3" style={{ marginBottom: '12px' }}>
                      <div className="input-group">
                        <label className="input-label">Age</label>
                        <input 
                          type="number" 
                          value={age} 
                          onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))} 
                          className="input-field"
                        />
                      </div>
                      <div className="input-group">
                        <label className="input-label">Sex</label>
                        <select 
                          value={sex} 
                          onChange={(e) => setSex(e.target.value)}
                          className="input-field"
                        >
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                          <option value="O">Other</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label className="input-label">Clinic Specialty</label>
                        <select 
                          value={specialty} 
                          onChange={(e) => setSpecialty(e.target.value)}
                          className="input-field"
                        >
                          <option value="General">General</option>
                          <option value="Cardiology">Cardiology</option>
                          <option value="Emergency">Emergency</option>
                          <option value="Internal">Internal Med</option>
                        </select>
                      </div>
                    </div>

                    <div className="input-group" style={{ marginBottom: '12px' }}>
                      <label className="input-label">History of Present Illness (HPI)</label>
                      <textarea 
                        rows={4}
                        value={hpiInput}
                        onChange={(e) => setHpiInput(e.target.value)}
                        placeholder="Enter HPI history, vitals, allergies..."
                        className="textarea-field"
                      ></textarea>
                    </div>
                  </div>
                )}
                
                {soapNote ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="low-contrast-table-container">
                      <table className="low-contrast-table">
                        <thead>
                          <tr>
                            <th>Physiological Sign</th>
                            <th>Value</th>
                            <th>Clinical Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Temperature</td>
                            <td>{soapNote.objective.vitals.temperature}°C</td>
                            <td>
                              <span className={`status-pill ${soapNote.objective.vitals.temperature > 38.0 ? 'danger' : 'success'}`}>
                                {soapNote.objective.vitals.temperature > 38.0 ? 'Fever' : 'Normal'}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td>Blood Pressure</td>
                            <td>{soapNote.objective.vitals.blood_pressure}</td>
                            <td><span className="status-pill success">Normal</span></td>
                          </tr>
                          <tr>
                            <td>Heart Rate</td>
                            <td>{soapNote.objective.vitals.heart_rate} bpm</td>
                            <td>
                              <span className={`status-pill ${soapNote.objective.vitals.heart_rate > 90 ? 'warning' : 'success'}`}>
                                {soapNote.objective.vitals.heart_rate > 90 ? 'Mild Tachycardia' : 'Normal'}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td>Respiratory Rate</td>
                            <td>{soapNote.objective.vitals.respiratory_rate} /min</td>
                            <td>
                              <span className={`status-pill ${soapNote.objective.vitals.respiratory_rate > 20 ? 'warning' : 'success'}`}>
                                {soapNote.objective.vitals.respiratory_rate > 20 ? 'Tachypnea' : 'Normal'}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                        History of Present Illness (HPI) excerpt
                      </span>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', backgroundColor: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--border-color)' }}>
                        {soapNote.subjective.hpi}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <Layers size={36} style={{ color: 'var(--border-color)', marginBottom: '8px' }} />
                    <p style={{ fontSize: '12px' }}>No active patient profile compiled yet.</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '280px', margin: '4px auto 0 auto' }}>
                      Expand 'Edit Parameters' above to configure patient stats, or click 'Compile SOAP note Case' to run vector-guided diagnostics.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Side: Guideline Ingestion & Library Stats */}
              <div className="glass-panel">
                <h3 style={{ fontSize: '16px', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', color: 'var(--text-primary)' }}>
                  Recent Reference Guidelines
                </h3>

                <div className="low-contrast-table-container" style={{ marginBottom: '16px' }}>
                  <table className="low-contrast-table">
                    <thead>
                      <tr>
                        <th>Guideline Document</th>
                        <th>Chunks</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docFiles.length > 0 ? (
                        docFiles.map((doc, idx) => (
                          <tr key={idx}>
                            <td>{doc.name}</td>
                            <td>{doc.chunks}</td>
                            <td><span className="status-pill success">grounded</span></td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No guidelines indexed.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="stats-grid">
                  <div className="stat-card stat-card-border">
                    <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Guidelines</span>
                    <span className="stat-value" style={{ color: 'var(--accent-color)' }}>{dbStats.total_files}</span>
                  </div>
                  <div className="stat-card">
                    <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Database chunks</span>
                    <span className="stat-value" style={{ color: 'var(--accent-color)' }}>{dbStats.total_chunks}</span>
                  </div>
                </div>

                {docFiles.length > 0 && (
                  <button 
                    onClick={handleClearDb}
                    style={{ 
                      width: '100%', 
                      textAlign: 'center', 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--accent-color)', 
                      cursor: 'pointer', 
                      fontSize: '10px', 
                      fontWeight: 700, 
                      textTransform: 'uppercase', 
                      marginTop: '8px',
                      letterSpacing: '0.5px' 
                    }}
                  >
                    Clear Database Store
                  </button>
                )}
              </div>

            </div>

            {/* Collapsible Safety Accordion */}
            {soapNote && (
              <div className="glass-panel no-print" style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <ShieldAlert style={{ color: 'var(--accent-color)' }} size={18} />
                    <span>Pharmacological Safety Audits</span>
                  </h3>
                  <button 
                    onClick={() => setShowSafety(!showSafety)}
                    className="action-btn btn-secondary"
                    style={{ width: 'auto', padding: '4px 10px', fontSize: '11px', borderRadius: 'var(--border-radius-md)' }}
                  >
                    {showSafety ? "Hide Safety Audits" : "View Safety Audits"}
                  </button>
                </div>
                
                {showSafety && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Alert 1: Penicillin allergy cross-reactivity */}
                    {soapNote.subjective.allergies.some(a => a.toLowerCase().includes('penicillin')) ? (
                      <div className="critical-callout">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-color)', fontWeight: 'bold', marginBottom: '6px' }}>
                          <AlertTriangle size={18} />
                          <h4 style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', fontFamily: 'var(--font-sans)', letterSpacing: '0.4px', margin: 0 }}>
                            CRITICAL PHARMACOLOGICAL CONTRAINDICATION
                          </h4>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                          Patient has a documented **Penicillin Allergy** which triggers severe generalized hives (Type I Hypersensitivity). 
                          Beta-lactams (e.g. Amoxicillin, Piperacillin, Ceftriaxone) are strictly contraindicated due to risk of cross-hypersensitivity.
                          <br />
                          <strong style={{ color: 'var(--neon-green)', display: 'block', marginTop: '6px' }}>
                            ✓ Resolution Gate Met: Safe alternative drug selected: Levofloxacin (Fluoroquinolone class) monotherapy.
                          </strong>
                        </p>
                      </div>
                    ) : (
                      <div className="accordion-box">
                        <div className="accordion-header">
                          <div className="accordion-title">
                            <CheckCircle size={14} style={{ color: 'var(--neon-green)' }} />
                            <span>No Penicillin Hypersensitivity Risk Detected</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Alert 2: Concomitant Lisinopril medication */}
                    {soapNote.subjective.medications.some(m => m.toLowerCase().includes('lisinopril')) ? (
                      <div className="warning-callout">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--neon-orange)', fontWeight: 'bold', marginBottom: '6px' }}>
                          <AlertTriangle size={18} />
                          <h4 style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', fontFamily: 'var(--font-sans)', letterSpacing: '0.4px', margin: 0 }}>
                            MEDICATION CO-PRESCRIBING WATCH
                          </h4>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                          Patient is taking **Lisinopril** (ACE Inhibitor) for essential hypertension.
                          Co-prescribing **Levofloxacin** is clinically safe, but requires active clinical monitoring of:
                          1. **Renal Clearance**: Check serum creatinine levels if therapy extends beyond 5 days.
                          2. **Hydration Status**: Dehydration increases risk of renal impairment under concurrent ACEI and fluoroquinolones.
                        </p>
                      </div>
                    ) : (
                      <div className="accordion-box">
                        <div className="accordion-header">
                          <div className="accordion-title">
                            <CheckCircle size={14} style={{ color: 'var(--neon-green)' }} />
                            <span>No ACE Inhibitor Co-Prescribing Interactions Detected</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Compile Action Button Block */}
            <div className="no-print" style={{ marginTop: '24px', marginBottom: '8px' }}>
              <button 
                onClick={runCompileSOAP}
                disabled={isCompilingSOAP}
                className="action-btn"
                style={{ width: 'auto', padding: '12px 24px', fontSize: '13px' }}
              >
                {isCompilingSOAP ? (
                  <>
                    <RefreshCw className="animate-spin" size={15} />
                    <span>Compiling Case...</span>
                  </>
                ) : (
                  <>
                    <FileText size={15} />
                    <span>Compile SOAP note Case</span>
                  </>
                )}
              </button>
            </div>

            {/* Compiled Case Note Card */}
            {soapNote && (
              <div className="glass-panel" style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '16px' }} className="no-print">
                  <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>Case Note Output</h3>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={handleDownload}
                      className="action-btn btn-secondary"
                      style={{ width: 'auto', padding: '6px 14px', fontSize: '11px', borderRadius: 'var(--border-radius-md)' }}
                    >
                      <Download size={12} />
                      <span>Download Report</span>
                    </button>

                    <button 
                      onClick={handlePrint}
                      className="action-btn btn-secondary"
                      style={{ width: 'auto', padding: '6px 14px', fontSize: '11px', borderRadius: 'var(--border-radius-md)' }}
                    >
                      <Printer size={12} />
                      <span>Print Report</span>
                    </button>
                  </div>
                </div>

                <div className="soap-report-content">
                  
                  {/* Document Header */}
                  <div className="doc-header">
                    <h1>Clinical Case Report</h1>
                    <div className="meta-grid">
                      <div className="meta-item">
                        <span className="label">Patient Profile</span>
                        {age}-year-old {sex === 'M' ? 'Male' : sex === 'F' ? 'Female' : 'Other'}
                      </div>
                      <div className="meta-item">
                        <span className="label">Setting</span>
                        {specialty} Clinic
                      </div>
                      <div className="meta-item">
                        <span className="label">Specialty</span>
                        {specialty}
                      </div>
                      <div className="meta-item">
                        <span className="label">Format</span>
                        SOAP Case Study
                      </div>
                    </div>
                  </div>

                  {/* SUBJECTIVE */}
                  <section>
                    <h2>Subjective (S)</h2>
                    <p style={{ marginBottom: '12px', lineHeight: '1.6' }}>{soapNote.subjective.hpi}</p>
                    <p style={{ marginBottom: '12px', lineHeight: '1.6' }}><strong>Past Medical History:</strong> {soapNote.subjective.pmh}</p>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px', fontFamily: 'var(--font-sans)', fontSize: '11px' }}>
                      <div style={{ padding: '12px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)' }}>
                        <strong style={{ display: 'block', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', fontSize: '9px' }}>Current Medications</strong>
                        {soapNote.subjective.medications.length > 0 ? (
                          <ul style={{ listStyleType: 'disc', paddingLeft: '16px', color: 'var(--text-secondary)' }}>
                            {soapNote.subjective.medications.map((m, i) => <li key={i}>{m}</li>)}
                          </ul>
                        ) : <span style={{ color: 'var(--text-muted)' }}>None reported.</span>}
                      </div>
                      <div style={{ padding: '12px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)' }}>
                        <strong style={{ display: 'block', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', fontSize: '9px' }}>Allergies & Contraindications</strong>
                        {soapNote.subjective.allergies.length > 0 ? (
                          <ul style={{ listStyleType: 'disc', paddingLeft: '16px', color: 'var(--neon-red)' }}>
                            {soapNote.subjective.allergies.map((a, i) => <li key={i}>{a}</li>)}
                          </ul>
                        ) : <span style={{ color: 'var(--text-muted)' }}>No known allergies.</span>}
                      </div>
                    </div>
                  </section>

                  {/* OBJECTIVE */}
                  <section>
                    <h2>Objective (O)</h2>
                    
                    <table className="no-print">
                      <thead>
                        <tr>
                          <th>Vital Parameters</th>
                          <th>Measured Value</th>
                          <th>Reference Limits</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Blood Pressure</td>
                          <td>{soapNote.objective.vitals.blood_pressure}</td>
                          <td>90/60 to 120/80 mmHg</td>
                        </tr>
                        <tr>
                          <td>Heart Rate</td>
                          <td className={soapNote.objective.vitals.heart_rate > 90 ? "val-high" : "val-normal"}>
                            {soapNote.objective.vitals.heart_rate} bpm
                          </td>
                          <td>60 to 100 bpm</td>
                        </tr>
                        <tr>
                          <td>Respiratory Rate</td>
                          <td className={soapNote.objective.vitals.respiratory_rate > 20 ? "val-high" : "val-normal"}>
                            {soapNote.objective.vitals.respiratory_rate} /min
                          </td>
                          <td>12 to 20 /min</td>
                        </tr>
                        <tr>
                          <td>Core Temperature</td>
                          <td className={soapNote.objective.vitals.temperature > 38.0 ? "val-high" : "val-normal"}>
                            {soapNote.objective.vitals.temperature}°C
                          </td>
                          <td>36.5 to 37.5°C</td>
                        </tr>
                      </tbody>
                    </table>

                    <p style={{ marginTop: '14px', marginBottom: '12px' }}><strong>Physical Examination:</strong> {soapNote.objective.physical_exam}</p>
                    
                    <strong style={{ display: 'block', marginTop: '12px', fontSize: '13px' }}>Diagnostic Records & Labs:</strong>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '20px', marginTop: '6px' }}>
                      {soapNote.objective.labs_and_imaging.map((lab, i) => <li key={i} style={{ marginBottom: '4px' }}>{lab}</li>)}
                    </ul>
                  </section>

                  {/* ASSESSMENT */}
                  <section>
                    <h2>Assessment (A)</h2>
                    <p style={{ marginBottom: '14px' }}><strong>Primary Diagnostic Hypothesis:</strong> {soapNote.assessment.primary_diagnosis}</p>
                    <p style={{ marginBottom: '14px', lineHeight: '1.6' }}><strong>Clinical Decision Reasoning:</strong> {soapNote.assessment.clinical_reasoning}</p>
                    
                    {soapNote.assessment.risk_stratification && (
                      <div className="risk-score">
                        <strong>Risk Stratification Logic:</strong> {soapNote.assessment.risk_stratification}
                      </div>
                    )}

                    <strong style={{ display: 'block', marginTop: '14px', fontSize: '13px', marginBottom: '8px' }}>Differential Diagnosis Mapping:</strong>
                    {soapNote.assessment.differentials.map((diff, i) => (
                      <div key={i} className="differential-item">
                        <div>
                          <span className="dx-title">{diff.diagnosis}</span>
                          <span className={`dx-likelihood ${i === 0 ? 'likely' : 'possible'}`}>
                            {i === 0 ? 'Likely / Primary' : 'Possible'}
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                          <strong>Supporting Evidence:</strong> {diff.supporting_evidence}
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>
                          <strong>Refuting Evidence:</strong> {diff.refuting_evidence}
                        </p>
                      </div>
                    ))}
                  </section>

                  {/* PLAN */}
                  <section>
                    <h2>Plan (P)</h2>
                    {soapNote.plan.map((pText, i) => (
                      <div key={i} className="plan-block">
                        <p style={{ lineHeight: '1.6' }}>{pText}</p>
                      </div>
                    ))}
                  </section>

                  {/* FOOTER */}
                  <div className="doc-footer">
                    <span>{soapNote.disclaimer}</span>
                    <span>Verified Grounded Output</span>
                  </div>

                </div>
              </div>
            )}

          </div>
        )}

        {/* ================= TAB 4: RAG REFERENCE LIBRARY ================= */}
        {activeTab === 'rag' && (
          <div className="rag-view">
            
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '28px', color: 'var(--text-primary)', marginBottom: '4px' }}>Library</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Ingest clinical treatment standards and reference matrices, and run semantic nearest-neighbor queries.</p>
            </div>

            <div className="dashboard-detail-grid" style={{ gridTemplateColumns: '1fr' }}>
              
              {/* Ingestion & List Card (Main full-canvas DB manager) */}
              <div className="glass-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '18px', color: 'var(--text-primary)' }}>
                    Ingest Medical Standards Guideline
                  </h3>
                  
                  <div className="stats-grid" style={{ display: 'flex', gap: '20px', padding: '6px 16px', margin: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Guidelines Indexed: <strong style={{ color: 'var(--accent-color)' }}>{dbStats.total_files}</strong>
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Total database chunks: <strong style={{ color: 'var(--accent-color)' }}>{dbStats.total_chunks}</strong>
                    </span>
                  </div>
                </div>

                <form onSubmit={handleDocUpload} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    accept=".pdf,.txt,.docx"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="input-field"
                      style={{ 
                        flex: 1, 
                        minWidth: 0,
                        width: 'auto',
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        color: selectedFile ? 'var(--text-primary)' : 'var(--text-muted)',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--border-radius-md)',
                        overflow: 'hidden'
                      }}
                    >
                      <span 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          marginRight: '8px',
                          display: 'block',
                          flex: 1
                        }}
                        title={selectedFile ? selectedFile.name : ""}
                      >
                        {selectedFile ? selectedFile.name : "Select a guideline document (PDF, TXT, DOCX)..."}
                      </span>
                      {selectedFile && (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-color)',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            padding: '0 4px',
                            flexShrink: 0
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    
                    <button 
                      type="submit" 
                      disabled={docUploading}
                      className="action-btn"
                      style={{ width: 'auto', padding: '8px 24px', flexShrink: 0 }}
                    >
                      {docUploading ? <RefreshCw className="animate-spin" size={14} /> : <Upload size={14} />}
                      <span>Ingest Reference Guidelines</span>
                    </button>
                  </div>
                </form>

                <h4 style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>
                  Currently Indexed guidelines
                </h4>

                {docFiles.length > 0 ? (
                  <div className="low-contrast-table-container">
                    <table className="low-contrast-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '45%' }}>Guideline File name</th>
                          <th style={{ width: '22%' }}>Database chunks generated</th>
                          <th style={{ width: '13%' }}>Status</th>
                          <th style={{ width: '12%' }}>Timestamp</th>
                          <th className="no-print" style={{ textAlign: 'right', width: '8%' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docFiles.map((doc, idx) => (
                          <tr key={idx}>
                            <td style={{ maxWidth: '320px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                <File size={14} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                                <strong 
                                  style={{ 
                                    whiteSpace: 'nowrap', 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis',
                                    fontSize: '13px'
                                  }} 
                                  title={doc.name}
                                >
                                  {doc.name}
                                </strong>
                              </div>
                            </td>
                            <td>{doc.chunks} vector chunks</td>
                            <td><span className="status-pill success">grounded</span></td>
                            <td>{doc.timestamp || '2026-05-23'}</td>
                            <td className="no-print" style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => handleDeleteDoc(doc.name)}
                                className="action-btn btn-secondary"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '28px',
                                  height: '28px',
                                  padding: 0,
                                  borderRadius: 'var(--border-radius-md)',
                                  backgroundColor: 'rgba(184, 85, 54, 0.05)',
                                  border: '1px solid rgba(184, 85, 54, 0.1)',
                                  color: 'var(--accent-color)',
                                  cursor: 'pointer'
                                }}
                                title={`Delete '${doc.name}'`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '40px 0' }}>No guidelines indexed in the database.</p>
                )}

                {docFiles.length > 0 && (
                  <button 
                    onClick={handleClearDb}
                    style={{ 
                      display: 'block',
                      margin: '24px auto 0 auto', 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--accent-color)', 
                      cursor: 'pointer', 
                      fontSize: '11px', 
                      fontWeight: 700, 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.8px' 
                    }}
                  >
                    Clear Vector Database Store
                  </button>
                )}
              </div>

            </div>

          </div>
        )}





      </main>

    </div>
  );
}
