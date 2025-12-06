// src/App.jsx
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { QRCodeCanvas } from 'qrcode.react';

// Hilfsfunktion: Boxnummer aus URL (?box=91) lesen
function getInitialBoxNoFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const boxStr = params.get('box');
    if (!boxStr) return null;
    const n = parseInt(boxStr, 10);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

function App() {
  const [boxes, setBoxes] = useState([]);
  const [selectedBox, setSelectedBox] = useState(null);
  const [boxItems, setBoxItems] = useState([]);
  const [outItems, setOutItems] = useState([]);

  const [loadingBoxes, setLoadingBoxes] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingOutItems, setLoadingOutItems] = useState(false);
  const [error, setError] = useState(null);

  // view: "boxes" | "out" | "search"
  const [view, setView] = useState('boxes');

  // Box-Liste Suche
  const [search, setSearch] = useState('');

  // Globale Item-Suche
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [itemSearchResults, setItemSearchResults] = useState([]);
  const [itemSearchLoading, setItemSearchLoading] = useState(false);

  // Formularzustand für neues Item
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemExactPosition, setNewItemExactPosition] = useState(''); // Regal 4, erste Reihe
  const [newItemPhotoFile, setNewItemPhotoFile] = useState(null);
  const [savingItem, setSavingItem] = useState(false);

  // Zustände zum „Wieder einsortieren“
  const [moveItemBoxId, setMoveItemBoxId] = useState(null);
  const [moveSaving, setMoveSaving] = useState(false);

  // Responsive + QR-Base-URL
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [baseUrl, setBaseUrl] = useState('');

  const initialBoxNo = getInitialBoxNoFromUrl();

  // Basis URL + Resize-Handler
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ---------------------------
  // Boxen laden
  // ---------------------------
  useEffect(() => {
    async function loadBoxes() {
      setLoadingBoxes(true);
      setError(null);

      const { data, error } = await supabase
        .from('boxes')
        .select('id, box_no, label, location, category, photo_url')
        .order('box_no', { ascending: true });

      if (error) {
        console.error(error);
        setError('Boxen konnten nicht geladen werden.');
        setBoxes([]);
      } else {
        setBoxes(data || []);
        if (data && data.length > 0) {
          if (initialBoxNo != null) {
            const match = data.find((b) => b.box_no === initialBoxNo);
            setSelectedBox(match || data[0]);
          } else {
            setSelectedBox(data[0]);
          }
        }
      }

      setLoadingBoxes(false);
    }

    loadBoxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------
  // Items für ausgewählte Box laden
  // ---------------------------
  useEffect(() => {
    if (!selectedBox) {
      setBoxItems([]);
      return;
    }

    async function loadItems() {
      setLoadingItems(true);
      setError(null);

      const { data, error } = await supabase
        .from('items')
        .select(
          'id, box_id, box_no, name, location, category, quantity, min_quantity, exact_position, is_out, photo_url'
        )
        .eq('box_id', selectedBox.id)
        .eq('is_out', false)
        .order('name', { ascending: true });

      if (error) {
        console.error(error);
        setError('Items für diese Box konnten nicht geladen werden.');
        setBoxItems([]);
      } else {
        setBoxItems(data || []);
      }

      setLoadingItems(false);
    }

    loadItems();
  }, [selectedBox]);

  // ---------------------------
  // Rausgenommene Items laden
  // ---------------------------
  async function refreshOutItems() {
    setLoadingOutItems(true);
    setError(null);

    const { data, error } = await supabase
      .from('items')
      .select(
        'id, box_id, box_no, name, location, category, quantity, min_quantity, exact_position, is_out, photo_url'
      )
      .eq('is_out', true)
      .order('name', { ascending: true });

    if (error) {
      console.error(error);
      setError('Rausgenommene Items konnten nicht geladen werden.');
      setOutItems([]);
    } else {
      setOutItems(data || []);
    }

    setLoadingOutItems(false);
  }

  useEffect(() => {
    if (view === 'out') {
      refreshOutItems();
    }
  }, [view]);

  // ---------------------------
  // Neues Item in die ausgewählte Box speichern
  // ---------------------------
  async function handleAddItem(e) {
    e.preventDefault();
    if (!selectedBox) return;
    if (!newItemName.trim()) {
      alert('Bitte einen Namen eingeben.');
      return;
    }

    setSavingItem(true);
    setError(null);

    // Optional: Foto hochladen
    let photoUrl = null;
    if (newItemPhotoFile) {
      const file = newItemPhotoFile;
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `box-${selectedBox.box_no}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(path, file);

      if (uploadError) {
        console.error(uploadError);
        alert('Foto konnte nicht hochgeladen werden. Item wird ohne Foto gespeichert.');
      } else {
        const { data: publicData } = supabase.storage
          .from('item-photos')
          .getPublicUrl(path);
        photoUrl = publicData?.publicUrl || null;
      }
    }

    const { data, error } = await supabase
      .from('items')
      .insert({
        box_id: selectedBox.id,
        box_no: selectedBox.box_no,
        name: newItemName.trim(),
        location: selectedBox.location,
        category: newItemCategory || null,
        quantity: newItemQuantity || 1,
        min_quantity: 0,
        exact_position: newItemExactPosition || null,
        is_out: false,
        photo_url: photoUrl,
      })
      .select(
        'id, box_id, box_no, name, location, category, quantity, min_quantity, exact_position, is_out, photo_url'
      )
      .single();

    if (error) {
      console.error(error);
      setError('Neues Item konnte nicht gespeichert werden.');
    } else if (data) {
      setBoxItems((prev) => [...prev, data]);
      setNewItemName('');
      setNewItemCategory('');
      setNewItemQuantity(1);
      setNewItemExactPosition('');
      setNewItemPhotoFile(null);
    }

    setSavingItem(false);
  }

  // ---------------------------
  // Item aus Box "rausnehmen"
  // ---------------------------
  async function handleTakeOut(item) {
    if (!window.confirm(`„${item.name}“ aus Box ${item.box_no} rausnehmen?`)) {
      return;
    }

    setError(null);

    const { error: updateError } = await supabase
      .from('items')
      .update({ is_out: true })
      .eq('id', item.id);

    if (updateError) {
      console.error(updateError);
      setError('Item konnte nicht als „rausgenommen“ markiert werden.');
      return;
    }

    // Bewegung loggen
    const { error: moveError } = await supabase.from('item_movements').insert({
      item_id: item.id,
      from_box_id: item.box_id,
      to_box_id: null,
      action: 'OUT',
      quantity: item.quantity || 1,
    });

    if (moveError) {
      console.error(moveError);
      // Fehler beim Loggen ist nicht kritisch
    }

    // UI aktualisieren
    setBoxItems((prev) => prev.filter((x) => x.id !== item.id));

    if (view === 'out') {
      refreshOutItems();
    }
  }

  // ---------------------------
  // Rausgenommenes Item zurück in eine Box legen
  // ---------------------------
  async function handleMoveBack(item) {
    if (!moveItemBoxId) {
      alert('Bitte eine Ziel-Box auswählen.');
      return;
    }

    setMoveSaving(true);
    setError(null);

    const targetBox = boxes.find((b) => b.id === moveItemBoxId);
    if (!targetBox) {
      alert('Ziel-Box nicht gefunden.');
      setMoveSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('items')
      .update({
        is_out: false,
        box_id: targetBox.id,
        box_no: targetBox.box_no,
        location: targetBox.location,
      })
      .eq('id', item.id);

    if (updateError) {
      console.error(updateError);
      setError('Item konnte nicht zurück ins Lager gelegt werden.');
      setMoveSaving(false);
      return;
    }

    // Bewegung loggen
    const { error: moveError } = await supabase.from('item_movements').insert({
      item_id: item.id,
      from_box_id: item.box_id,
      to_box_id: targetBox.id,
      action: 'IN',
      quantity: item.quantity || 1,
    });

    if (moveError) {
      console.error(moveError);
    }

    // UI aktualisieren
    setOutItems((prev) => prev.filter((x) => x.id !== item.id));

    if (selectedBox && selectedBox.id === targetBox.id) {
      const { data, error } = await supabase
        .from('items')
        .select(
          'id, box_id, box_no, name, location, category, quantity, min_quantity, exact_position, is_out, photo_url'
        )
        .eq('box_id', selectedBox.id)
        .eq('is_out', false)
        .order('name', { ascending: true });

      if (!error && data) {
        setBoxItems(data);
      }
    }

    setMoveSaving(false);
  }

  // ---------------------------
  // Globale Item-Suche
  // ---------------------------
  async function handleItemSearch(e) {
    e.preventDefault();
    const term = itemSearchTerm.trim();
    if (!term) {
      setItemSearchResults([]);
      return;
    }

    setItemSearchLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('items')
      .select(
        'id, name, box_id, box_no, location, category, quantity, exact_position, is_out'
      )
      .ilike('name', `%${term}%`)
      .order('box_no', { ascending: true });

    if (error) {
      console.error(error);
      setError('Items konnten nicht gesucht werden.');
      setItemSearchResults([]);
    } else {
      setItemSearchResults(data || []);
    }

    setItemSearchLoading(false);
  }

  function openBoxFromResult(item) {
    let box = boxes.find((b) => b.id === item.box_id);
    if (!box) {
      box = boxes.find((b) => b.box_no === item.box_no);
    }
    if (box) {
      setSelectedBox(box);
      setView('boxes');
    } else {
      alert('Box für dieses Item wurde nicht gefunden.');
    }
  }

  // ---------------------------
  // Gefilterte Boxen (Suche im linken Panel)
  // ---------------------------
  const filteredBoxes = boxes.filter((b) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      String(b.box_no).includes(term) ||
      (b.label || '').toLowerCase().includes(term) ||
      (b.location || '').toLowerCase().includes(term)
    );
  });

  // ---------------------------
  // UI
  // ---------------------------
  return (
    <div
      style={{
        padding: '16px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        background: '#020617',
        minHeight: '100vh',
        color: '#e5e7eb',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>AdS Lager</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.8 }}>
            Boxen, Inhalte & rausgenommene Dinge – alles in einem Blick.
          </p>
        </header>

        {/* Tabs */}
        <div
          style={{
            display: 'inline-flex',
            borderRadius: 999,
            border: '1px solid rgba(148,163,184,0.5)',
            padding: 2,
            marginBottom: 12,
            background: 'rgba(15,23,42,0.9)',
          }}
        >
          <button
            onClick={() => setView('boxes')}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 13,
              cursor: 'pointer',
              background:
                view === 'boxes' ? 'rgba(248,113,113,0.9)' : 'transparent',
              color: view === 'boxes' ? '#0f172a' : '#e5e7eb',
            }}
          >
            Boxen & Inhalt
          </button>
          <button
            onClick={() => setView('out')}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 13,
              cursor: 'pointer',
              background:
                view === 'out' ? 'rgba(248,113,113,0.9)' : 'transparent',
              color: view === 'out' ? '#0f172a' : '#e5e7eb',
            }}
          >
            Rausgenommene Items
          </button>
          <button
            onClick={() => setView('search')}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 13,
              cursor: 'pointer',
              background:
                view === 'search' ? 'rgba(248,113,113,0.9)' : 'transparent',
              color: view === 'search' ? '#0f172a' : '#e5e7eb',
            }}
          >
            Item-Suche
          </button>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 10,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(248,113,113,0.15)',
              border: '1px solid rgba(248,113,113,0.6)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* View: Boxen & Inhalt */}
        {view === 'boxes' && (
          <div
            style={{
              display: isMobile ? 'block' : 'grid',
              gridTemplateColumns: isMobile
                ? undefined
                : 'minmax(0, 1.1fr) minmax(0, 1.6fr)',
              gap: isMobile ? 0 : 12,
            }}
          >
            {/* Box-Liste */}
            <div
              style={{
                background: 'radial-gradient(circle at top left, #1e293b, #020617)',
                borderRadius: 16,
                padding: 12,
                border: '1px solid rgba(148,163,184,0.6)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>Boxen</div>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>
                    {boxes.length} Boxen
                  </div>
                </div>
              </div>

              <input
                type="text"
                placeholder="Boxnummer, Label oder Ort suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  marginBottom: 8,
                  borderRadius: 8,
                  border: '1px solid rgba(148,163,184,0.7)',
                  background: 'rgba(15,23,42,0.9)',
                  color: '#e5e7eb',
                  fontSize: 13,
                }}
              />

              {loadingBoxes ? (
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  Boxen werden geladen…
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: isMobile ? '40vh' : '60vh',
                    overflowY: 'auto',
                    paddingRight: 4,
                  }}
                >
                  {filteredBoxes.map((box) => (
                    <div
                      key={box.id}
                      onClick={() => setSelectedBox(box)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 10,
                        marginBottom: 4,
                        cursor: 'pointer',
                        border:
                          selectedBox && selectedBox.id === box.id
                            ? '1px solid rgba(248,113,113,0.9)'
                            : '1px solid rgba(30,64,175,0.4)',
                        background:
                          selectedBox && selectedBox.id === box.id
                            ? 'rgba(248,113,113,0.18)'
                            : 'rgba(15,23,42,0.8)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                            }}
                          >
                            Box {box.box_no} {box.label ? `– ${box.label}` : ''}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              opacity: 0.75,
                            }}
                          >
                            {box.location || 'Ort unbekannt'}
                            {box.category ? ` · ${box.category}` : ''}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 999,
                            border: '1px solid rgba(148,163,184,0.7)',
                            background: 'rgba(15,23,42,0.9)',
                          }}
                        >
                          Inhalt ansehen
                        </div>
                      </div>
                    </div>
                  ))}

                  {filteredBoxes.length === 0 && (
                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      Keine Box passend zur Suche gefunden.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Box-Detail + Formular */}
            <div
              style={{
                background: 'radial-gradient(circle at top left, #1f2937, #020617)',
                borderRadius: 16,
                padding: 12,
                border: '1px solid rgba(148,163,184,0.6)',
                marginTop: isMobile ? 12 : 0,
              }}
            >
              {selectedBox ? (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.7,
                        marginBottom: 2,
                      }}
                    >
                      Ausgewählte Box
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                    >
                      Box {selectedBox.box_no}{' '}
                      {selectedBox.label ? `– ${selectedBox.label}` : ''}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.75,
                      }}
                    >
                      {selectedBox.location || 'Ort unbekannt'}
                      {selectedBox.category ? ` · ${selectedBox.category}` : ''}
                    </div>
                  </div>

                  {/* QR-Code für diese Box */}
                  {baseUrl && (
                    <div
                      style={{
                        marginTop: 8,
                        marginBottom: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          opacity: 0.7,
                        }}
                      >
                        QR-Code für diese Box – mit dem Handy scannen:
                      </div>
                      <div
                        style={{
                          padding: 6,
                          borderRadius: 12,
                          background: 'rgba(15,23,42,0.9)',
                          border: '1px solid rgba(148,163,184,0.6)',
                        }}
                      >
                        <QRCodeCanvas
  value={`${window.location.origin}?box=${selectedBox.box_no}`}
  size={96}           // Größe des Codes
  bgColor="#ffffff"   // Hintergrund: weiß
  fgColor="#000000"   // Vordergrund: schwarz
  level="M"
  includeMargin={false}
/>
                      </div>
                    </div>
                  )}

                  {/* Inhalt */}
                  <div style={{ marginTop: 4, marginBottom: 8 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Inhalt ({boxItems.length})
                    </div>
                    {loadingItems ? (
                      <div
                        style={{
                          fontSize: 13,
                          opacity: 0.8,
                        }}
                      >
                        Inhalt wird geladen…
                      </div>
                    ) : boxItems.length === 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          opacity: 0.8,
                        }}
                      >
                        In dieser Box ist (noch) nichts eingetragen.
                      </div>
                    ) : (
                      <div
                        style={{
                          maxHeight: '42vh',
                          overflowY: 'auto',
                          paddingRight: 4,
                        }}
                      >
                        {boxItems.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              padding: '6px 8px',
                              borderRadius: 8,
                              background: 'rgba(15,23,42,0.85)',
                              border: '1px solid rgba(30,64,175,0.6)',
                              marginBottom: 4,
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontWeight: 500,
                                  fontSize: 13,
                                }}
                              >
                                {item.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  opacity: 0.7,
                                }}
                              >
                                Menge: {item.quantity || 1}
                                {item.category ? ` · ${item.category}` : ''}
                                {item.exact_position
                                  ? ` · Pos: ${item.exact_position}`
                                  : ''}
                              </div>
                            </div>
                            <button
                              onClick={() => handleTakeOut(item)}
                              style={{
                                border: 'none',
                                borderRadius: 999,
                                padding: '4px 10px',
                                fontSize: 11,
                                cursor: 'pointer',
                                background: 'rgba(248,113,113,0.9)',
                                color: '#0f172a',
                                alignSelf: 'center',
                              }}
                            >
                              Rausnehmen
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Neues Item Formular */}
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: '1px solid rgba(148,163,184,0.4)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Neues Item in diese Box
                    </div>
                    <form
                      onSubmit={handleAddItem}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
                        gap: 8,
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <input
                          type="text"
                          placeholder="Name des Items (z.B. Kissenbezüge)"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            marginBottom: 4,
                            borderRadius: 8,
                            border: '1px solid rgba(148,163,184,0.7)',
                            background: 'rgba(15,23,42,0.9)',
                            color: '#e5e7eb',
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Kategorie (optional)"
                          value={newItemCategory}
                          onChange={(e) => setNewItemCategory(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            marginBottom: 4,
                            borderRadius: 8,
                            border: '1px solid rgba(148,163,184,0.7)',
                            background: 'rgba(15,23,42,0.9)',
                            color: '#e5e7eb',
                          }}
                        />
                        <input
                          type="number"
                          min={1}
                          placeholder="Menge"
                          value={newItemQuantity}
                          onChange={(e) =>
                            setNewItemQuantity(Number(e.target.value) || 1)
                          }
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            marginBottom: 4,
                            borderRadius: 8,
                            border: '1px solid rgba(148,163,184,0.7)',
                            background: 'rgba(15,23,42,0.9)',
                            color: '#e5e7eb',
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Genauer Ort (z.B. Regal 4, erste Reihe)"
                          value={newItemExactPosition}
                          onChange={(e) =>
                            setNewItemExactPosition(e.target.value)
                          }
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: 8,
                            border: '1px solid rgba(148,163,184,0.7)',
                            background: 'rgba(15,23,42,0.9)',
                            color: '#e5e7eb',
                          }}
                        />
                      </div>
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setNewItemPhotoFile(file);
                          }}
                          style={{
                            width: '100%',
                            marginBottom: 4,
                            fontSize: 12,
                          }}
                        />
                        <button
                          type="submit"
                          disabled={savingItem}
                          style={{
                            width: '100%',
                            marginTop: 4,
                            padding: '6px 8px',
                            borderRadius: 999,
                            border: 'none',
                            cursor: 'pointer',
                            background: 'rgba(34,197,94,0.9)',
                            color: '#022c22',
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                        >
                          {savingItem ? 'Speichern…' : 'Item hinzufügen'}
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              ) : (
                <div>Keine Box ausgewählt.</div>
              )}
            </div>
          </div>
        )}

        {/* View: Rausgenommene Items */}
        {view === 'out' && (
          <div
            style={{
              background: 'radial-gradient(circle at top left, #1e293b, #020617)',
              borderRadius: 16,
              padding: 12,
              border: '1px solid rgba(148,163,184,0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                  }}
                >
                  Rausgenommene Items
                </div>
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.75,
                  }}
                >
                  Dinge, die momentan in keiner Box sind
                </div>
              </div>
              <button
                onClick={refreshOutItems}
                style={{
                  border: 'none',
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  background: 'rgba(59,130,246,0.85)',
                  color: '#e5e7eb',
                  alignSelf: 'center',
                }}
              >
                Aktualisieren
              </button>
            </div>

            {loadingOutItems ? (
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                Rausgenommene Items werden geladen…
              </div>
            ) : outItems.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                Aktuell sind keine Items als „rausgenommen“ markiert.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: '65vh',
                  overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
                {/* Auswahl der Ziel-Box */}
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: 12,
                    opacity: 0.8,
                  }}
                >
                  Ziel-Box für „zurücklegen“:
                  <select
                    value={moveItemBoxId || ''}
                    onChange={(e) =>
                      setMoveItemBoxId(e.target.value || null)
                    }
                    style={{
                      marginLeft: 6,
                      padding: '2px 6px',
                      borderRadius: 6,
                      border: '1px solid rgba(148,163,184,0.7)',
                      background: 'rgba(15,23,42,0.9)',
                      color: '#e5e7eb',
                      fontSize: 12,
                    }}
                  >
                    <option value="">— Ziel-Box wählen —</option>
                    {boxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        Box {b.box_no} {b.label ? `– ${b.label}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {outItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 8,
                      background: 'rgba(15,23,42,0.85)',
                      border: '1px solid rgba(30,64,175,0.6)',
                      marginBottom: 4,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: 13,
                        }}
                      >
                        {item.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          opacity: 0.7,
                        }}
                      >
                        Menge: {item.quantity || 1}
                        {item.category ? ` · ${item.category}` : ''}
                        {item.exact_position
                          ? ` · Pos: ${item.exact_position}`
                          : ''}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          opacity: 0.7,
                        }}
                      >
                        Letzte Box:{' '}
                        {item.box_no ? `Box ${item.box_no}` : 'unbekannt'} ·{' '}
                        {item.location || 'Ort unbekannt'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleMoveBack(item)}
                      disabled={moveSaving}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontSize: 11,
                        cursor: 'pointer',
                        background: 'rgba(34,197,94,0.9)',
                        color: '#022c22',
                        alignSelf: 'center',
                      }}
                    >
                      {moveSaving ? 'Wird verschoben…' : 'In Box legen'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* View: Item-Suche */}
        {view === 'search' && (
          <div
            style={{
              background: 'radial-gradient(circle at top left, #1e293b, #020617)',
              borderRadius: 16,
              padding: 12,
              border: '1px solid rgba(148,163,184,0.6)',
            }}
          >
            <div
              style={{
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  marginBottom: 4,
                }}
              >
                Item-Suche
              </div>
              <form
                onSubmit={handleItemSearch}
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  type="text"
                  placeholder="Name des Items suchen…"
                  value={itemSearchTerm}
                  onChange={(e) => setItemSearchTerm(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1px solid rgba(148,163,184,0.7)',
                    background: 'rgba(15,23,42,0.9)',
                    color: '#e5e7eb',
                    fontSize: 13,
                  }}
                />
                <button
                  type="submit"
                  disabled={itemSearchLoading}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    background: 'rgba(59,130,246,0.9)',
                    color: '#e5e7eb',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {itemSearchLoading ? 'Suche…' : 'Suchen'}
                </button>
              </form>
              <div
                style={{
                  fontSize: 11,
                  opacity: 0.7,
                }}
              >
                Tipp: Auf einen Treffer klicken, um direkt zu der Box zu springen.
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                maxHeight: '65vh',
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {itemSearchResults.length === 0 && !itemSearchLoading ? (
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  Noch keine Treffer. Bitte einen Suchbegriff eingeben.
                </div>
              ) : (
                itemSearchResults.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => openBoxFromResult(item)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 8,
                      background: 'rgba(15,23,42,0.85)',
                      border: '1px solid rgba(30,64,175,0.6)',
                      marginBottom: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: 13,
                          }}
                        >
                          {item.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            opacity: 0.7,
                          }}
                        >
                          Box {item.box_no ?? '–'} ·{' '}
                          {item.location || 'Ort unbekannt'}
                          {item.category ? ` · ${item.category}` : ''}
                          {item.exact_position
                            ? ` · Pos: ${item.exact_position}`
                            : ''}
                          {item.is_out ? ' · (aktuell rausgenommen)' : ''}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid rgba(148,163,184,0.7)',
                          background: 'rgba(15,23,42,0.9)',
                        }}
                      >
                        Öffnen
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;