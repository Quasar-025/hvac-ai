import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'results', 'baseline', 'optimized', 'actions'

  const dataDir = path.join(process.cwd(), '..', 'data');
  
  try {
    let fileName = '';
    switch (type) {
      case 'results':
        fileName = 'results.json';
        break;
      case 'baseline':
        fileName = 'baseline_timestep_data.json';
        break;
      case 'optimized':
        fileName = 'optimized_timestep_data.json';
        break;
      case 'actions':
        fileName = 'control_actions.json';
        break;
      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const filePath = path.join(dataDir, fileName);
    const data = await fs.readFile(filePath, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    console.error(`Error reading ${type} data:`, error);
    return NextResponse.json({ error: `Data not available for ${type}` }, { status: 404 });
  }
}
