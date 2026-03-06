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

  // Currency State
  const [exchangeRate, setExchangeRate] = useState(4.5);

  // Fees
  const [totalShipping, setTotalShipping] = useState(0);
  const [totalImportTax, setTotalImportTax] = useState(0);

  // Taobao Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [taobaoOrderText, setTaobaoOrderText] = useState('');

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

  const updateItemPrice = (idx, priceStr) => {
    const updated = [...items];
    updated[idx].price = parseFloat(priceStr) || 0;
    setItems(updated);
  };

  const toggleItemShare = (idx) => {
    const updated = [...items];
    updated[idx].isShared = !updated[idx].isShared;
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

  const handleSmartImport = () => {
    if (!taobaoOrderText.trim()) return;

    // 1. 解析淘寶文字資料 (常見格式：品名 ... 金額 ... 或是 CSV 列)
    // 預期抓取像 "商品名稱... 123.45" 這種模式
    // 常見淘寶複製格式中，金額前方常有 ￥ 或 "實付" 等關鍵字
    const lines = taobaoOrderText.split('\n');
    const tbItems = [];

    // 這裡使用較寬鬆的正則抓取可能包含金額的行
    lines.forEach(line => {
      // 匹配金額 (可能有 ￥ 符號，或者是純數字)
      const priceMatch = line.match(/(?:￥|實付|元|[:：])\s*(\d+(\.\d{1,2})?)/) || line.match(/(\d+(\.\d{1,2})?)$/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);
        // 嘗試抓取該行前面的文字作為品名 (去除金額部分)
        const name = line.replace(priceMatch[0], '').trim().substring(0, 50);
        if (name && price > 0) {
          tbItems.push({ name, price });
        }
      }
    });

    if (tbItems.length === 0) {
      alert('無法從貼上的文字中識別出商品名稱與金額，請確認格式。');
      return;
    }

    // 2. 與現有 items 進行模糊比對
    const updatedItems = [...items];
    let matchCount = 0;

    updatedItems.forEach(item => {
      if (item.price > 0) return; // 已有金額的不自動覆蓋

      // 找出最匹配的淘寶品名
      let bestMatch = null;
      let maxScore = 0;

      tbItems.forEach(tb => {
        // 簡單的比對邏輯：集運品名是否有包含在淘寶品名中，反之亦然
        // 或是重疊的字數越多分數越高
        let score = 0;
        const itemName = item.itemName.toLowerCase();
        const tbName = tb.name.toLowerCase();

        if (tbName.includes(itemName) || itemName.includes(tbName)) {
          score = Math.min(itemName.length, tbName.length);
        }

        if (score > maxScore) {
          maxScore = score;
          bestMatch = tb;
        }
      });

      if (bestMatch && maxScore > 1) { // 至少對上兩個字以上才算
        item.price = parseFloat((bestMatch.price * exchangeRate).toFixed(2));
        matchCount++;
      }
    });

    setItems(updatedItems);
    setShowImportModal(false);
    setTaobaoOrderText('');
    alert(`對比完成！成功自動填入 ${matchCount} 項商品的金額。`);
  };

  const handleExcelImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // 從 Excel 數據中查找品名、金額與日期
      // 根據截圖：B欄(1)是訂單時間, E欄(4)是品名, J欄(9)是金額
      const tbItems = [];
      let latestOrderDateStr = null;

      data.forEach((row, rowIndex) => {
        if (rowIndex === 0) return; // 跳過標題列
        const submitTime = row[1]; // Column B
        const name = row[4]; // Column E
        let priceStr = row[9]; // Column J

        // 嘗試提取第一個有效的日期 (格式: YYYY-MM-DD)
        if (submitTime && !latestOrderDateStr) {
          if (typeof submitTime === 'string') {
            const match = submitTime.match(/^(\d{4}-\d{2}-\d{2})/);
            if (match) latestOrderDateStr = match[1];
          } else if (typeof submitTime === 'number') {
            // 將 Excel 序列日期轉為 JS 日期
            const date = new Date((submitTime - (25567 + 1)) * 86400 * 1000);
            latestOrderDateStr = date.toISOString().split('T')[0];
          }
        }

        if (name && priceStr) {
          // 清理金額字串 (移除 ￥ 等符號)
          let price = parseFloat(String(priceStr).replace(/[^\d.]/g, ''));
          if (!isNaN(price)) {
            tbItems.push({ name: String(name), price });
          }
        }
      });

      if (tbItems.length === 0) {
        alert('無法從 Excel 中提取到有效的品名與金額，請確認格式。');
        return;
      }

      // 查詢歷史匯率 API
      let currentExRate = exchangeRate;
      let rateFetched = false;
      if (latestOrderDateStr) {
        try {
          // 嘗試拿訂單日期的匯率
          let res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${latestOrderDateStr}/v1/currencies/cny.json`);
          if (!res.ok) {
            // 拿不到 (可能因為是未來/尚未結算)，改拿最新匯率
            res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json`);
          }
          if (res.ok) {
            const json = await res.json();
            if (json?.cny?.twd) {
              currentExRate = json.cny.twd;
              setExchangeRate(parseFloat(currentExRate.toFixed(4)));
              rateFetched = true;
            }
          }
        } catch (err) {
          console.warn('匯率抓取失敗，使用預設匯率', err);
        }
      }

      // 與現成 items 進行比對
      const updatedItems = [...items];
      let matchCount = 0;
      updatedItems.forEach(item => {
        if (item.price > 0) return;
        let bestMatch = null;
        let maxScore = 0;

        tbItems.forEach(tb => {
          let score = 0;
          const itemName = item.itemName.toLowerCase();
          const tbName = tb.name.toLowerCase();
          if (tbName.includes(itemName) || itemName.includes(tbName)) {
            score = Math.min(itemName.length, tbName.length);
          }
          if (score > maxScore) {
            maxScore = score;
            bestMatch = tb;
          }
        });

        if (bestMatch && maxScore > 1) {
          item.price = parseFloat((bestMatch.price * currentExRate).toFixed(2));
          matchCount++;
        }
      });

      setItems(updatedItems);
      setShowImportModal(false);

      let msg = `Excel 對比完成！成功自動填入 ${matchCount} 項金額。`;
      if (rateFetched) {
        msg += `\n\n網頁已自動依照您的訂單日期（${latestOrderDateStr}）載入當日匯率：${currentExRate.toFixed(4)}`;
      }
      alert(msg);
    };
    reader.readAsBinaryString(file);
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
        const itemWeightPerc = totalWeight > 0 ? (item.weight / totalWeight) : 0;

        // 若為多人分帳，個別項目的進口稅分攤比例需分開計算
        let itemPrice = item.price;
        if (item.isShared) {
          itemPrice = item.shares.reduce((s, share) => s + share.price, 0);
        }

        const itemPricePerc = totalPrice > 0 ? (itemPrice / totalPrice) : 0;
        const itemShipping = itemWeightPerc * totalShipping;
        const itemTax = itemPricePerc * totalImportTax;
        const itemTotal = itemPrice + itemShipping + itemTax;

        sumQty += item.quantity;
        sumWeight += item.weight;
        sumPrice += item.price;
        sumShipping += itemShipping;
        sumTax += itemTax;
        sumTotal += itemTotal;

        rows.push([
          item.buyer || '未分配',
          item.trackingNum,
          item.deliveryNum,
          `"${item.itemName}"`, // wrap in quotes to escape commas in name
          item.quantity,
          item.weight.toFixed(2),
          (itemWeightPerc * 100).toFixed(2) + '%',
          item.price.toFixed(2),
          itemShipping.toFixed(2),
          itemTax.toFixed(2),
          itemTotal.toFixed(2)
        ]);
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

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `shipping_${type}_summary.csv`);
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
          <h2>步驟一：貼上集運明細</h2>
          <div className="form-group">
            <label>請貼上包含「快递单号、发货单号、货物品名、数量、实际重量」的原始文字：</label>
            <textarea
              rows={12}
              value={rawData}
              onChange={e => setRawData(e.target.value)}
              placeholder="快递单号 ：YT7603957692449 发货单号 ：8877237390 备注 ：&#10;货物品名 ：男平角内裤 数量 ：1 到库天数 ：21&#10;实际重量 ：0.52 尺寸 (cm)：0.00*0.00*0.00 附加费 ：0.00"
            ></textarea>
          </div>
          <div className="text-right">
            <button onClick={handleParse}>解析資料 👉</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <>
          <div className="card flex gap-4" style={{ flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px' }}>
              <h2 style={{ marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>總體費用設定</h2>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>總運費 (請輸入您付款的運費)</label>
                <input type="number" min="0" value={totalShipping} onChange={e => setTotalShipping(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
              </div>

              <div className="flex" style={{ gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>總進口稅 (TWD)</label>
                  <input type="number" min="0" value={totalImportTax} onChange={e => setTotalImportTax(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label style={{ color: 'var(--primary-color)' }}>匯率 (RMB ➜ TWD)</label>
                  <input type="number" step="0.01" min="0" value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
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
                <button
                  className="secondary"
                  onClick={() => setShowImportModal(!showImportModal)}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem', borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
                >
                  ✨ 智能匯入淘寶金額
                </button>
                <span className="badge" style={{ backgroundColor: 'var(--primary-color)', color: 'white', padding: '0.5rem 1rem' }}>
                  共 {items.length} 筆項目 / 總重 {items.reduce((sum, i) => sum + i.weight, 0).toFixed(2)} kg
                </span>
              </div>
            </div>

            {showImportModal && (
              <div className="card" style={{ backgroundColor: '#f8f9ff', border: '2px dashed var(--primary-color)', marginBottom: '1.5rem', padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: 'var(--primary-color)' }}>智能自動填表</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  請從淘寶「已買到的寶貝」全選複製列表文字貼在下方，<b>或者直接選取導出的 Excel (.xlsx) 檔案。</b>
                </p>

                <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '1.5rem', background: 'white' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>方式 A：上傳 Excel 檔案 (推薦)</label>
                  <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} style={{ fontSize: '0.875rem' }} />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>方式 B：貼上訂單文字</label>
                  <textarea
                    rows={4}
                    placeholder="在此貼上複製的訂單文字..."
                    value={taobaoOrderText}
                    onChange={(e) => setTaobaoOrderText(e.target.value)}
                    style={{ fontSize: '0.875rem' }}
                  ></textarea>
                </div>

                <div className="flex justify-between">
                  <button className="secondary" onClick={() => setShowImportModal(false)}>取消</button>
                  <button onClick={handleSmartImport} disabled={!taobaoOrderText.trim()}>立刻對比訂單文字 👉</button>
                </div>
              </div>
            )}

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
                              {item.quantity}
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <label className="share-label">
                                  <input type="checkbox" checked={item.isShared} onChange={() => toggleItemShare(idx)} />
                                  多人分帳
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
                                const itemPrice = item.shares.reduce((s, sh) => s + sh.price, 0);
                                return totalPrice > 0 ? ((itemPrice / totalPrice) * 100).toFixed(1) + '%' : '0.0%';
                              })()}
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
                              <td>
                                <input type="number" min="0" placeholder="金額" value={share.price || ''} onChange={e => updateSharePrice(idx, sIdx, e.target.value)} />
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
                          {item.quantity}
                          {item.quantity > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <label className="share-label">
                                <input type="checkbox" checked={item.isShared || false} onChange={() => toggleItemShare(idx)} />
                                多人分帳
                              </label>
                            </div>
                          )}
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
                            placeholder="金額"
                            value={item.price || ''}
                            onChange={e => updateItemPrice(idx, e.target.value)}
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
