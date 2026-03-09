import React, { useState, useMemo } from 'react';
import './index.css';
import * as XLSX from 'xlsx';

function App() {
  const [step, setStep] = useState(1);
  const [rawData, setRawData] = useState('');

  // Parsed Items
  const [items, setItems] = useState([]);
  // Global App State
  const [buyers, setBuyers] = useState([]);
  const [newBuyerName, setNewBuyerName] = useState('');

  // Fees
  const [totalShipping, setTotalShipping] = useState(0);
  const [totalImportTax, setTotalImportTax] = useState(0);

  // Taobao Import State (Removed as per request)
  // const [showImportModal, setShowImportModal] = useState(false);
  // const [taobaoOrderText, setTaobaoOrderText] = useState('');

  const handleParse = () => {
    // Basic Parsing Logic
    // Example target block to match:
    // 快递单号 ：YT7603957692449 发货单号 ：8877237390 备注 ：
    // 货物品名 ：男平角内裤 数量 ：1 到库天数 ：21
    // 实际重量 ：0.52 尺寸 (cm)：0.00*0.00*0.00 附加费 ：0.00

    // Some lines might wrap differently, or spaces could vary
    const regex = /快递单号\s*[：:]\s*(\S+).*?发货单号\s*[：:]\s*(\S+)[\s\S]*?货物品名\s*[：:]\s*(.*?)\s+数量\s*[：:]\s*(\d+)[\s\S]*?实际重量\s*[：:]\s*([\d.]+)/g;

    const parsedItems = [];
    let match;
    let sumWeight = 0;
    while ((match = regex.exec(rawData)) !== null) {
      const weight = parseFloat(match[5]);
      sumWeight += weight;
      const quantity = parseInt(match[4], 10);
      parsedItems.push({
        id: match[1] + '-' + match[2] + '-' + Math.random().toString(36).substr(2, 5),
        trackingNum: match[1],
        deliveryNum: match[2],
        itemName: match[3],
        quantity: quantity,
        weight: weight,
        buyer: '',
        price: 0,
        isShared: false,
        shares: Array.from({ length: quantity }).map(() => ({ buyer: '', price: 0 }))
      });
    }

    if (parsedItems.length === 0) {
      alert('無法解析資料，請檢查格式是否正確！');
      return;
    }

    // Set weight proportion for each item
    const itemsWithPerc = parsedItems.map(item => ({
      ...item,
      weightPercentage: sumWeight > 0 ? (item.weight / sumWeight) : 0
    }));

    setItems(itemsWithPerc);
    setStep(2);
  };

  const handleAddBuyer = (e) => {
    e.preventDefault();
    if (!newBuyerName.trim()) return;
    if (!buyers.includes(newBuyerName.trim())) {
      setBuyers([...buyers, newBuyerName.trim()]);
    }
    setNewBuyerName('');
  };

  const handleRemoveBuyer = (buyerToRemove) => {
    setBuyers(buyers.filter(b => b !== buyerToRemove));
    setItems(items.map(item => item.buyer === buyerToRemove ? { ...item, buyer: '' } : item));
  };

  const updateItemBuyer = (idx, buyer) => {
    const updated = [...items];
    updated[idx].buyer = buyer;
    setItems(updated);
  };

  const updateItemQuantity = (idx, qtyStr) => {
    const qty = parseInt(qtyStr, 10) || 1;
    const updated = [...items];
    const item = updated[idx];
    item.quantity = qty;

    // 調整 shares 陣列大小，保留舊有資料
    const currentShares = item.shares || [];
    if (currentShares.length < qty) {
      const newShares = Array.from({ length: qty - currentShares.length }).map(() => ({ buyer: '', price: 0, weight: 1 }));
      item.shares = [...currentShares, ...newShares];
    } else if (currentShares.length > qty) {
      item.shares = currentShares.slice(0, qty);
    }

    // 如果正在分帳，重新計算分配
    if (item.isShared) {
      recalculateShares(item);
    }

    setItems(updated);
  };

  const recalculateShares = (item) => {
    const totalWeight = item.shares.reduce((sum, s) => sum + (parseFloat(s.weight) || 0), 0);
    if (totalWeight > 0) {
      item.shares.forEach(s => {
        const weight = parseFloat(s.weight) || 0;
        s.price = parseFloat(((weight / totalWeight) * item.price).toFixed(2));
      });
    }
  };

  const toggleItemShare = (idx) => {
    const updated = [...items];
    const item = updated[idx];
    const wasShared = item.isShared;
    item.isShared = !wasShared;

    if (item.isShared) {
      // 開啟分帳：設權重為 1，並按權重均分
      item.shares = item.shares.map(s => ({
        buyer: s.buyer || item.buyer,
        price: s.price > 0 ? s.price : (item.price / item.quantity),
        weight: s.weight || 1
      }));
      recalculateShares(item);
    } else {
      // 關閉分帳：加總金額
      item.price = item.shares.reduce((sum, s) => sum + s.price, 0);
      const firstBuyer = item.shares.find(s => s.buyer)?.buyer;
      if (firstBuyer) item.buyer = firstBuyer;
    }
    setItems(updated);
  };

  const updateShareWeight = (idx, sIdx, weightStr) => {
    const updated = [...items];
    const item = updated[idx];
    item.shares[sIdx].weight = parseFloat(weightStr) || 0;
    recalculateShares(item);
    setItems(updated);
  };

  const updateItemPriceAdjusted = (idx, priceStr) => {
    const updated = [...items];
    const item = updated[idx];
    item.price = parseFloat(priceStr) || 0;
    if (item.isShared) {
      recalculateShares(item);
    }
    setItems(updated);
  };

  const updateShareBuyer = (idx, sIdx, buyer) => {
    const updated = [...items];
    updated[idx].shares[sIdx].buyer = buyer;
    setItems(updated);
  };

  const updateSharePrice = (idx, sIdx, priceStr) => {
    const updated = [...items];
    updated[idx].shares[sIdx].price = parseFloat(priceStr) || 0;
    setItems(updated);
  };

  const handleTxtImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setRawData(evt.target.result);
    };
    reader.readAsText(file);
  };

  const handleDetailedCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      const lines = content.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) return;

      // 簡易 CSV 解析 (處理引號)
      const parseCSVLine = (line) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) {
            result.push(cur);
            cur = '';
          } else cur += char;
        }
        result.push(cur);
        return result;
      };

      const rows = lines.slice(1).map(parseCSVLine);
      const itemsMap = new Map();
      let importedBuyers = new Set();
      let importedShipping = 0;
      let importedTax = 0;

      rows.forEach(row => {
        if (row[0] === '總計') {
          importedShipping = parseFloat(row[8]) || 0;
          importedTax = parseFloat(row[9]) || 0;
          return;
        }

        const buyer = row[0] === '未分配' ? '' : row[0];
        const track = row[1];
        const delivery = row[2];
        let name = row[3];
        const qty = parseInt(row[4], 10) || 1;
        const weight = parseFloat(row[5]) || 0;
        const price = parseFloat(row[7]) || 0;

        if (buyer) importedBuyers.add(buyer);

        const key = `${track}-${delivery}`;
        // 判斷是否為分帳項 (品名結尾有 (x/y))
        const shareMatch = name.match(/^(.*)\s\((\d+)\/(\d+)\)$/);

        if (!itemsMap.has(key)) {
          itemsMap.set(key, {
            id: key + '-' + Math.random().toString(36).substr(2, 5),
            trackingNum: track,
            deliveryNum: delivery,
            itemName: shareMatch ? shareMatch[1] : name.replace(/"/g, ''), // Remove quotes from item name
            quantity: shareMatch ? parseInt(shareMatch[3], 10) : qty,
            weight: 0, // Will sum up from shares
            price: 0, // Will sum up from shares or be set directly
            isShared: !!shareMatch,
            shares: [],
            buyer: shareMatch ? '' : buyer
          });
        }

        const item = itemsMap.get(key);
        item.weight += weight; // Sum up weight for the main item
        if (shareMatch) {
          item.shares.push({ buyer, price, weight: 1 }); // Weight is 1 for each share for recalculation
          item.price += price; // Sum up price for the main item if shared
        } else {
          item.price = price; // For non-shared items, price is directly set
        }
      });

      const finalItems = Array.from(itemsMap.values());
      const sumWeight = finalItems.reduce((s, i) => s + i.weight, 0);
      const itemsWithPerc = finalItems.map(item => ({
        ...item,
        weightPercentage: sumWeight > 0 ? (item.weight / sumWeight) : 0
      }));

      setItems(itemsWithPerc);
      setBuyers(Array.from(importedBuyers));
      setTotalShipping(importedShipping);
      setTotalImportTax(importedTax);
      setStep(2);
    };
    reader.readAsText(file);
  };

  const calculateSummary = () => {
    let unassigned = 0;
    items.forEach(i => {
      if (i.isShared) {
        unassigned += i.shares.filter(s => !s.buyer).length;
      } else {
        if (!i.buyer) unassigned += 1;
      }
    });

    if (unassigned > 0) {
      if (!window.confirm(`還有 ${unassigned} 個物品未分配購買人，確定要繼續嗎？\n(按確定後，它們將會被歸類為「未分配」並一併進行結算)`)) {
        return;
      }
    }
    setStep(3);
  };

  const summaryData = useMemo(() => {
    const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
    const totalPrice = items.reduce((sum, i) => {
      if (i.isShared) return sum + i.shares.reduce((s, share) => s + share.price, 0);
      return sum + i.price;
    }, 0);

    // 將「空字串(未分配)」也加入計算名單中
    const allBuyers = [...buyers, ''];

    const result = allBuyers.map(buyer => {
      let buyerWeight = 0;
      let buyerPrice = 0;
      let itemCount = 0;

      items.forEach(i => {
        if (i.isShared) {
          i.shares.forEach(share => {
            if ((share.buyer || '') === buyer) {
              buyerWeight += (i.weight / i.quantity);
              buyerPrice += share.price;
              itemCount += 1;
            }
          });
        } else {
          if ((i.buyer || '') === buyer) {
            buyerWeight += i.weight;
            buyerPrice += i.price;
            itemCount += i.quantity;
          }
        }
      });

      const weightPerc = totalWeight > 0 ? (buyerWeight / totalWeight) : 0;
      const pricePerc = totalPrice > 0 ? (buyerPrice / totalPrice) : 0;

      const shippingFee = weightPerc * totalShipping;
      const importTax = pricePerc * totalImportTax;
      const totalCost = buyerPrice + shippingFee + importTax;

      return {
        buyer: buyer || '未分配', // 如果名字是空的，設定為未分配
        weightPerc: weightPerc,
        weight: buyerWeight,
        price: buyerPrice,
        shippingFee,
        importTax,
        totalCost,
        itemCount: itemCount,
        pricePerc: pricePerc
      };
    }).filter(r => r.buyer !== '未分配' || r.itemCount > 0); // 若未分配的數量為 0，則報表中隱藏

    return result;
  }, [items, buyers, totalShipping, totalImportTax]);

  const handleExportCSV = (type) => {
    let csvContent = '';

    if (type === 'simple') {
      const headers = ['購買人', '物品數量', '物品重量占比', '物品重量(公斤)', '運費', '商品價格', '進口稅', '總價'];
      const rows = summaryData.map(d => [
        d.buyer,
        d.itemCount,
        (d.weightPerc * 100).toFixed(2) + '%',
        d.weight.toFixed(2),
        d.shippingFee.toFixed(2),
        d.price.toFixed(2),
        d.importTax.toFixed(2),
        d.totalCost.toFixed(2)
      ]);

      // Add Total Row
      const totalItemCount = items.reduce((sum, i) => sum + i.quantity, 0);
      rows.push([
        '總計',
        totalItemCount,
        '100.00%',
        summaryData.reduce((s, d) => s + d.weight, 0).toFixed(2),
        summaryData.reduce((s, d) => s + d.shippingFee, 0).toFixed(2),
        summaryData.reduce((s, d) => s + d.price, 0).toFixed(2),
        summaryData.reduce((s, d) => s + d.importTax, 0).toFixed(2),
        summaryData.reduce((s, d) => s + d.totalCost, 0).toFixed(2)
      ]);

      csvContent = headers.join(',') + '\n' + rows.map(e => e.join(',')).join('\n');
    } else {
      const headers = ['購買人', '快遞單號', '發貨單號', '品名', '數量', '商品重量(kg)', '重量占比', '商品價格', '分攤運費', '分攤進口稅', '該項總價'];
      const rows = [];
      const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
      const totalPrice = items.reduce((sum, i) => {
        if (i.isShared) return sum + i.shares.reduce((s, share) => s + share.price, 0);
        return sum + i.price;
      }, 0);

      const sortedItems = [...items].sort((a, b) => (a.buyer || '未分配').localeCompare(b.buyer || '未分配'));

      let sumQty = 0;
      let sumWeight = 0;
      let sumPrice = 0;
      let sumShipping = 0;
      let sumTax = 0;
      let sumTotal = 0;

      sortedItems.forEach(item => {
        if (item.isShared) {
          // 多人分帳：每一份(share)都拆成獨立的一列 CSV
          item.shares.forEach((share, sIdx) => {
            const shareWeight = item.weight / item.quantity;
            const weightPerc = totalWeight > 0 ? (shareWeight / totalWeight) : 0;
            const pricePerc = totalPrice > 0 ? (share.price / totalPrice) : 0;
            const shippingFee = weightPerc * totalShipping;
            const importTax = pricePerc * totalImportTax;
            const total = share.price + shippingFee + importTax;

            sumQty += 1;
            sumWeight += shareWeight;
            sumPrice += share.price;
            sumShipping += shippingFee;
            sumTax += importTax;
            sumTotal += total;

            rows.push([
              share.buyer || '未分配',
              item.trackingNum,
              item.deliveryNum,
              `"${item.itemName} (${sIdx + 1}/${item.quantity})"`,
              1,
              shareWeight.toFixed(2),
              (weightPerc * 100).toFixed(2) + '%',
              share.price.toFixed(2),
              shippingFee.toFixed(2),
              importTax.toFixed(2),
              total.toFixed(2)
            ]);
          });
        } else {
          // 一般單人項目
          const weightPerc = totalWeight > 0 ? (item.weight / totalWeight) : 0;
          const pricePerc = totalPrice > 0 ? (item.price / totalPrice) : 0;
          const shippingFee = weightPerc * totalShipping;
          const importTax = pricePerc * totalImportTax;
          const total = item.price + shippingFee + importTax;

          sumQty += item.quantity;
          sumWeight += item.weight;
          sumPrice += item.price;
          sumShipping += shippingFee;
          sumTax += importTax;
          sumTotal += total;

          rows.push([
            item.buyer || '未分配',
            item.trackingNum,
            item.deliveryNum,
            `"${item.itemName}"`,
            item.quantity,
            item.weight.toFixed(2),
            (weightPerc * 100).toFixed(2) + '%',
            item.price.toFixed(2),
            shippingFee.toFixed(2),
            importTax.toFixed(2),
            total.toFixed(2)
          ]);
        }
      });

      rows.push([
        '總計',
        '',
        '',
        '',
        sumQty,
        sumWeight.toFixed(2),
        '100.00%',
        sumPrice.toFixed(2),
        sumShipping.toFixed(2),
        sumTax.toFixed(2),
        sumTotal.toFixed(2)
      ]);

      csvContent = headers.join(',') + '\n' + rows.map(e => e.join(',')).join('\n');
    }

    const now = new Date();
    const timestamp = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `shipping_${type}_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
      <header>
        <h1>集運計算神器 🚀</h1>
        <p className="subtitle">輕鬆分攤集運運費與金額</p>
      </header>

      <div className="stepper">
        <div style={{ position: 'absolute', top: '19px', left: '15%', right: '15%', height: '2px', backgroundColor: 'var(--border-color)', zIndex: 1 }}>
          <div style={{ height: '100%', backgroundColor: 'var(--primary-color)', width: step === 1 ? '0%' : step === 2 ? '50%' : '100%', transition: 'width 0.3s ease' }}></div>
        </div>
        <div className="flex justify-between" style={{ width: '100%' }}>
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '33%' }}>
            <div className={`step ${step >= 1 ? 'active' : ''}`}>1</div>
            <span className="step-label" style={{ color: step >= 1 ? 'var(--primary-color)' : 'var(--text-muted)' }}>貼上物流資料</span>
          </div>
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '34%' }}>
            <div className={`step ${step >= 2 ? 'active' : ''}`}>2</div>
            <span className="step-label" style={{ color: step >= 2 ? 'var(--primary-color)' : 'var(--text-muted)' }}>分配商品與金額</span>
          </div>
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '33%' }}>
            <div className={`step ${step >= 3 ? 'active' : ''}`}>3</div>
            <span className="step-label" style={{ color: step >= 3 ? 'var(--primary-color)' : 'var(--text-muted)' }}>計算並匯出</span>
          </div>
        </div>
      </div>

      {step === 1 && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2>步驟一：載入集運資料</h2>
            <div className="flex gap-2">
              <label className="secondary-btn" style={{ cursor: 'pointer', padding: '0.5rem 1rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.875rem' }}>
                📁 匯入 TXT
                <input type="file" accept=".txt" onChange={handleTxtImport} style={{ display: 'none' }} />
              </label>
              <label className="secondary-btn" style={{ cursor: 'pointer', padding: '0.5rem 1rem', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', borderRadius: '8px', fontSize: '0.875rem' }}>
                🔄 恢復詳細報表 (CSV)
                <input type="file" accept=".csv" onChange={handleDetailedCSVImport} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
          <div className="form-group">
            <label>請貼上原始文字，或從上方按鈕匯入檔案：</label>
            <textarea
              rows={12}
              value={rawData}
              onChange={e => setRawData(e.target.value)}
              placeholder="快递单号 ：YT7603957692449 发货单号 ：8877237390 备注 ：&#10;货物品名 ：男平角内裤 数量 ：1 到库天数 ：21&#10;实际重量 ：0.52 尺寸 (cm)：0.00*0.00*0.00 附加费 ：0.00"
            ></textarea>
          </div>
          <div className="text-right">
            <button onClick={handleParse}>解析並開始分配 👉</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <>
          <div className="card flex gap-4" style={{ flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px' }}>
              <h2 style={{ marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>總體費用設定</h2>

              <div className="flex" style={{ gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: '1rem' }}>
                  <label>總運費 (TWD)</label>
                  <input type="number" min="0" value={totalShipping} onChange={e => setTotalShipping(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: '1rem' }}>
                  <label>總進口稅 (TWD)</label>
                  <input type="number" min="0" value={totalImportTax} onChange={e => setTotalImportTax(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
                </div>
              </div>
            </div>

            <div style={{ flex: '1 1 300px' }}>
              <h2 style={{ marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>管理購買人</h2>
              <form onSubmit={handleAddBuyer} className="flex" style={{ alignItems: 'flex-end', gap: '0.75rem' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>新增購買人</label>
                  <input type="text" placeholder="輸入購買人姓名" value={newBuyerName} onChange={e => setNewBuyerName(e.target.value)} style={{ width: '100%' }} />
                </div>
                <button type="submit" style={{ whiteSpace: 'nowrap', minWidth: '100px' }}>新增人名</button>
              </form>
              <div className="flex gap-2" style={{ flexWrap: 'wrap', marginTop: '1.25rem' }}>
                {buyers.map(b => (
                  <span key={b} className="badge">
                    {b}
                    <span className="badge-remove" onClick={() => handleRemoveBuyer(b)} title="移除">✕</span>
                  </span>
                ))}
                {buyers.length === 0 && <span className="text-muted" style={{ fontSize: '0.875rem' }}>尚未新增人名</span>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2>步驟二：分配商品與輸入金額</h2>
              <div className="flex gap-2">
                <span className="badge" style={{ backgroundColor: 'var(--primary-color)', color: 'white', padding: '0.5rem 1rem' }}>
                  共 {items.length} 筆項目 / 總重 {items.reduce((sum, i) => sum + i.weight, 0).toFixed(2)} kg
                </span>
              </div>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>品名</th>
                    <th>單號</th>
                    <th style={{ width: '120px' }}>數量</th>
                    <th>重量(kg) / 占比</th>
                    <th>金額占比(稅)</th>
                    <th style={{ width: '150px' }}>購買人</th>
                    <th style={{ width: '150px' }}>商品金額</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    if (item.isShared) {
                      return (
                        <React.Fragment key={item.id}>
                          <tr style={{ backgroundColor: '#f9fafb' }}>
                            <td style={{ fontWeight: 500 }}>{item.itemName}</td>
                            <td>
                              <div style={{ fontSize: '0.875rem' }}>快: {item.trackingNum}</div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>發: {item.deliveryNum}</div>
                            </td>
                            <td className="text-center" style={{ minWidth: '100px', verticalAlign: 'middle' }}>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => updateItemQuantity(idx, e.target.value)}
                                style={{ width: '60px', textAlign: 'center', marginBottom: '4px' }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <label className="share-label">
                                  <input type="checkbox" checked={item.isShared} onChange={() => toggleItemShare(idx)} />
                                  分帳
                                </label>
                              </div>
                            </td>
                            <td className="text-center">
                              {item.weight}
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {(item.weightPercentage * 100).toFixed(1)}%
                              </div>
                            </td>
                            <td className="text-center" style={{ color: 'var(--success-color)', fontWeight: 500 }}>
                              {(() => {
                                const totalPrice = items.reduce((sum, i) => {
                                  if (i.isShared) return sum + i.shares.reduce((s, share) => s + share.price, 0);
                                  return sum + i.price;
                                }, 0);
                                const itemPrice = item.isShared ? item.shares.reduce((s, sh) => s + sh.price, 0) : item.price;
                                return totalPrice > 0 ? ((itemPrice / totalPrice) * 100).toFixed(1) + '%' : '0.0%';
                              })()}
                            </td>
                            {/* 分帳模式下，主列保留購買人(隱藏/禁用)與總金額輸入框 */}
                            <td className="text-muted text-center" style={{ fontSize: '0.8rem' }}> (多人分帳) </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                placeholder="填入總金額"
                                value={item.price || ''}
                                onChange={e => updateItemPriceAdjusted(idx, e.target.value)}
                                style={{ border: '2px solid var(--primary-color)', backgroundColor: '#fff' }}
                              />
                            </td>
                          </tr>
                          {item.shares.map((share, sIdx) => (
                            <tr key={`${item.id}-share-${sIdx}`} style={{ backgroundColor: '#fdfdfd' }}>
                              <td colSpan={2} className="text-right text-muted" style={{ fontSize: '0.875rem' }}>
                                ↳ {item.itemName} (分帳 {sIdx + 1}/{item.quantity})
                              </td>
                              <td className="text-center text-muted">1</td>
                              <td className="text-center text-muted">{(item.weight / item.quantity).toFixed(2)}</td>
                              <td className="text-center text-muted">{((item.weightPercentage / item.quantity) * 100).toFixed(1)}%</td>
                              <td>
                                <select value={share.buyer} onChange={e => updateShareBuyer(idx, sIdx, e.target.value)}>
                                  <option value="">--未分配--</option>
                                  {buyers.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                              </td>
                              <td style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="比例/權重"
                                  value={share.weight || ''}
                                  onChange={e => updateShareWeight(idx, sIdx, e.target.value)}
                                  style={{ width: '70px' }}
                                />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>➔ ${share.price.toFixed(1)}</span>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    }

                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 500 }}>{item.itemName}</td>
                        <td>
                          <div style={{ fontSize: '0.875rem' }}>快: {item.trackingNum}</div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>發: {item.deliveryNum}</div>
                        </td>
                        <td className="text-center" style={{ minWidth: '120px', verticalAlign: 'middle' }}>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => updateItemQuantity(idx, e.target.value)}
                            style={{ width: '60px', textAlign: 'center', marginBottom: '4px' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <label className="share-label">
                              <input type="checkbox" checked={item.isShared || false} onChange={() => toggleItemShare(idx)} />
                              分帳
                            </label>
                          </div>
                        </td>
                        <td className="text-center">
                          {item.weight}
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {(item.weightPercentage * 100).toFixed(1)}%
                          </div>
                        </td>
                        <td className="text-center" style={{ color: 'var(--success-color)', fontWeight: 500 }}>
                          {(() => {
                            const totalPrice = items.reduce((sum, i) => {
                              if (i.isShared) return sum + i.shares.reduce((s, share) => s + share.price, 0);
                              return sum + i.price;
                            }, 0);
                            const itemPrice = item.isShared ? item.shares.reduce((s, sh) => s + sh.price, 0) : item.price;
                            return totalPrice > 0 ? ((itemPrice / totalPrice) * 100).toFixed(1) + '%' : '0.0%';
                          })()}
                        </td>
                        <td>
                          <select value={item.buyer} onChange={e => updateItemBuyer(idx, e.target.value)}>
                            <option value="">--未分配--</option>
                            {buyers.map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            placeholder="總金額"
                            value={item.price || ''}
                            onChange={e => updateItemPriceAdjusted(idx, e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between mt-4">
              <button className="secondary" onClick={() => setStep(1)}>👈 上一步</button>
              <button onClick={calculateSummary}>產生報表 👉</button>
            </div>
          </div>
        </>
      )}

      {step === 3 && (
        <div className="card">
          <h2>步驟三：結算總表</h2>
          <div className="table-container mb-4">
            <table>
              <thead>
                <tr>
                  <th>購買人</th>
                  <th className="text-center">重量(kg)</th>
                  <th className="text-center">重量占比</th>
                  <th className="text-right">運費</th>
                  <th className="text-right">商品價格</th>
                  <th className="text-center">金額占比(稅)</th>
                  <th className="text-right">進口稅</th>
                  <th className="text-right">總價</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted" style={{ padding: '2rem' }}>
                      未分配任何物品
                    </td>
                  </tr>
                ) : summaryData.map(d => (
                  <tr key={d.buyer}>
                    <td style={{ fontWeight: 600 }}>{d.buyer}</td>
                    <td className="text-center">{d.weight.toFixed(2)}</td>
                    <td className="text-center">{(d.weightPerc * 100).toFixed(2)}%</td>
                    <td className="text-right">${d.shippingFee.toFixed(2)}</td>
                    <td className="text-right">${d.price.toFixed(2)}</td>
                    <td className="text-center" style={{ color: 'var(--success-color)', fontWeight: 500 }}>{(d.pricePerc * 100).toFixed(2)}%</td>
                    <td className="text-right">${d.importTax.toFixed(2)}</td>
                    <td className="text-right" style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                      ${d.totalCost.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {summaryData.length > 0 && (
                  <tr style={{ backgroundColor: '#f9fafb', borderTop: '2px solid var(--border-color)' }}>
                    <td style={{ fontWeight: 700 }}>總計</td>
                    <td className="text-center font-bold">{summaryData.reduce((s, d) => s + d.weight, 0).toFixed(2)}</td>
                    <td className="text-center font-bold">100.00%</td>
                    <td className="text-right font-bold">${summaryData.reduce((s, d) => s + d.shippingFee, 0).toFixed(2)}</td>
                    <td className="text-right font-bold">${summaryData.reduce((s, d) => s + d.price, 0).toFixed(2)}</td>
                    <td className="text-center font-bold" style={{ color: 'var(--success-color)' }}>100.00%</td>
                    <td className="text-right font-bold">${summaryData.reduce((s, d) => s + d.importTax, 0).toFixed(2)}</td>
                    <td className="text-right font-bold" style={{ fontWeight: 700, color: 'var(--primary-color)' }}>
                      ${summaryData.reduce((s, d) => s + d.totalCost, 0).toFixed(2)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-4">
            <button className="secondary" onClick={() => setStep(2)}>👈 返回修改</button>
            <div className="flex gap-2">
              <button className="secondary" onClick={() => handleExportCSV('simple')} style={{ color: 'var(--success-color)', borderColor: 'var(--success-color)' }}>
                📥 簡易版報表
              </button>
              <button onClick={() => handleExportCSV('detailed')} style={{ backgroundColor: 'var(--success-color)' }}>
                📝 詳細版報表
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
