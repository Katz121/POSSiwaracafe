import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';

export const seedDatabase = async (db, appId) => {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    // Helper to add to batch
    const addToBatch = (collectionName, data) => {
        const ref = doc(collection(db, 'artifacts', appId, 'public', 'data', collectionName));
        batch.set(ref, { ...data, createdAt: now, updatedAt: now });
    };

    // 1. Categories
    const categories = [
        { name: 'Coffee', icon: '☕', color: 'amber' },
        { name: 'Tea', icon: '🍵', color: 'emerald' },
        { name: 'Milk', icon: '🥛', color: 'blue' },
        { name: 'Soda', icon: '🥤', color: 'red' },
        { name: 'Smoothie', icon: '🍓', color: 'pink' }
    ];
    categories.forEach(c => addToBatch('categories', c));

    // 2. Stock Items
    const stockItems = [
        { name: 'เมล็ดกาแฟ (คั่วกลาง)', quantity: 2000, unit: 'g', minQuantity: 500, pricePerUnit: 0.5 },
        { name: 'เมล็ดกาแฟ (คั่วเข้ม)', quantity: 2000, unit: 'g', minQuantity: 500, pricePerUnit: 0.5 },
        { name: 'นมสด Meiji', quantity: 5000, unit: 'ml', minQuantity: 1000, pricePerUnit: 0.05 },
        { name: 'นมข้นหวาน', quantity: 10, unit: 'กระป๋อง', minQuantity: 2, pricePerUnit: 25 },
        { name: 'แก้ว 16oz', quantity: 500, unit: 'ใบ', minQuantity: 50, pricePerUnit: 2 },
        { name: 'ฝาโดม', quantity: 500, unit: 'ชิ้น', minQuantity: 50, pricePerUnit: 1 },
        { name: 'ผงชาไทย', quantity: 1000, unit: 'g', minQuantity: 200, pricePerUnit: 0.3 }
    ];
    stockItems.forEach(s => addToBatch('stock', s));

    // 3. Menu Items
    const menuItems = [
        { name: 'Espresso', price: 40, category: 'Coffee', description: 'กาแฟเข้มข้น', isBestSeller: false },
        { name: 'Americano', price: 45, category: 'Coffee', description: 'กาแฟดำ', isBestSeller: true },
        { name: 'Cappuccino', price: 55, category: 'Coffee', description: 'ฟองนมนุ่มๆ', isBestSeller: false },
        { name: 'Latte', price: 55, category: 'Coffee', description: 'นมสดหอมมัน', isBestSeller: true },
        { name: 'Mocha', price: 60, category: 'Coffee', description: 'กาแฟผสมโกโก้', isBestSeller: false },
        { name: 'Thai Tea', price: 50, category: 'Tea', description: 'ชาไทยโบราณ', isBestSeller: true },
        { name: 'Green Tea', price: 55, category: 'Tea', description: 'ชาเขียวนม', isBestSeller: false },
        { name: 'Lemon Tea', price: 45, category: 'Tea', description: 'ชามะนาวเปรี้ยวหวาน', isBestSeller: false },
        { name: 'Cocoa', price: 50, category: 'Milk', description: 'โกโก้เข้มข้น', isBestSeller: true },
        { name: 'Pink Milk', price: 45, category: 'Milk', description: 'นมชมพู', isBestSeller: false },
        { name: 'Red Lime Soda', price: 45, category: 'Soda', description: 'แดงมะนาวโซดา', isBestSeller: false },
        { name: 'Blue Hawaii', price: 45, category: 'Soda', description: 'บลูฮาวาย', isBestSeller: false },
        { name: 'Strawberry Smoothie', price: 65, category: 'Smoothie', description: 'สตอเบอรี่ปั่น', isBestSeller: false }
    ];
    menuItems.forEach(m => addToBatch('menu', m));

    // 4. Bean Modifiers
    const beanModifiers = [
        { name: 'คั่วกลาง', price: 0, stockLinks: [] },
        { name: 'คั่วเข้ม', price: 0, stockLinks: [] },
        { name: 'คั่วอ่อน (+10)', price: 10, stockLinks: [] }
    ];
    beanModifiers.forEach(b => addToBatch('beanModifiers', b));

    // 5. Quick Expenses
    const quickExpenses = [
        { label: '#ค่าน้ำแข็ง 40.-', title: 'น้ำแข็งหลอด', amount: 40, unit: 'กระสอบ', category: 'วัตถุดิบ', icon: '🧊' },
        { label: '#ค่าแรงพนักงาน', title: 'ค่าจ้างรายวัน', amount: 350, unit: 'วัน', category: 'ค่าจ้าง', icon: '👤' },
        { label: '#ซื้อนมสด 7-11', title: 'นมสด Meiji', amount: 96, unit: 'ขวด', category: 'วัตถุดิบ', icon: '🥛' }
    ];
    quickExpenses.forEach(q => addToBatch('quickExpenses', q));

    await batch.commit();
};
