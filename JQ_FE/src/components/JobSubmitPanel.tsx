import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Upload, Sparkles, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { generateUUID } from '../lib/mock-data';
import { CreateJobInput } from '../lib/api';
import type { Job } from '../types/job';

interface JobSubmitPanelProps {
  onJobSubmit: (input: CreateJobInput) => Promise<Job | null>;
}

const SAMPLE_JSON = `[
  {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "age": 32,
    "department": "Engineering"
  },
  {
    "id": 2,
    "name": "Jane Smith",
    "email": "jane@example.com",
    "age": 28,
    "department": "Marketing"
  }
]`;

export function JobSubmitPanel({ onJobSubmit }: JobSubmitPanelProps) {
  const [label, setLabel] = useState('');
  const [inputMode, setInputMode] = useState<'json' | 'csv'>('json');
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON);
  const [jsonError, setJsonError] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string>('');
  
  const [requiredFields, setRequiredFields] = useState('id,email');
  const [dropNulls, setDropNulls] = useState(true);
  const [dedupeFields, setDedupeFields] = useState('email');
  const [numericField, setNumericField] = useState('age');
  const [strictMode, setStrictMode] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [copied, setCopied] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateJSON = (value: string) => {
    if (!value.trim()) {
      setJsonError('JSON input is required');
      return false;
    }
    
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        setJsonError('JSON must be an array of objects');
        return false;
      }
      if (parsed.length === 0) {
        setJsonError('JSON array cannot be empty');
        return false;
      }
      setJsonError('');
      return true;
    } catch (e) {
      setJsonError('Invalid JSON syntax');
      return false;
    }
  };

  const handleJSONChange = (value: string) => {
    setJsonInput(value);
    validateJSON(value);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      
      // Read first few lines for preview
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split('\n').slice(0, 6);
        setCsvPreview(lines.join('\n'));
      };
      reader.readAsText(file);
      
      toast.success(`CSV file "${file.name}" loaded`);
    }
  };

  const generateIdempotencyKey = () => {
    const uuid = generateUUID();
    setIdempotencyKey(uuid);
    setCopied(false);
  };

  const copyIdempotencyKey = async () => {
    await navigator.clipboard.writeText(idempotencyKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  const handleSubmit = async () => {
    if (!label.trim()) {
      toast.error('Please enter a job label');
      return;
    }

    if (inputMode === 'json' && !validateJSON(jsonInput)) {
      toast.error('Please fix JSON validation errors');
      return;
    }

    if (inputMode === 'csv' && !csvFile) {
      toast.error('Please upload a CSV file');
      return;
    }

    setIsSubmitting(true);

    const config = {
      requiredFields: requiredFields.split(',').map(f => f.trim()).filter(Boolean),
      dropNulls,
      dedupeOn: dedupeFields.split(',').map(f => f.trim()).filter(Boolean),
      numericField: numericField || undefined,
      strictMode,
      idempotencyKey: idempotencyKey || undefined
    };

    const payload: CreateJobInput = {
      label,
      inputMode,
      rows: inputMode === 'json' ? JSON.parse(jsonInput) : [],
      config,
      csvFile,
      maxAttempts: 3,
    };

    try {
      const result = await onJobSubmit(payload);
      if (result?.id) {
        toast.success(`Job "${label}" submitted successfully!`, {
          description: `Job ID: ${result.id}`
        });

        // Reset form
        setLabel('');
        setJsonInput(SAMPLE_JSON);
        setIdempotencyKey('');
        setCsvFile(null);
        setCsvPreview('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          Submit Data Processing Job
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Job Label */}
        <div className="space-y-2">
          <Label htmlFor="job-label">Job Label</Label>
          <Input
            id="job-label"
            placeholder="e.g., Customer Data Import - Q1 2024"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        {/* Dataset Input */}
        <div className="space-y-2">
          <Label>Dataset Input</Label>
          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'json' | 'csv')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="json">JSON Editor</TabsTrigger>
              <TabsTrigger value="csv">CSV Upload</TabsTrigger>
            </TabsList>
            
            <TabsContent value="json" className="space-y-2">
              <Textarea
                placeholder="Enter JSON array of objects..."
                value={jsonInput}
                onChange={(e) => handleJSONChange(e.target.value)}
                className="font-mono text-sm min-h-[200px]"
              />
              {jsonError && (
                <div className="text-sm text-red-600 flex items-center gap-1">
                  <Badge variant="destructive" className="text-xs">Error</Badge>
                  {jsonError}
                </div>
              )}
              {!jsonError && jsonInput && (
                <div className="text-sm text-green-600 flex items-center gap-1">
                  <Badge variant="outline" className="text-xs border-green-600 text-green-600">Valid</Badge>
                  {JSON.parse(jsonInput).length} rows
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="csv" className="space-y-2">
              <Label 
                htmlFor="csv-upload" 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors block"
              >
                <Upload className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-600">
                    {csvFile ? csvFile.name : 'Click to upload CSV file'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Supports .csv files up to 10MB
                  </p>
                </div>
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCSVUpload}
                />
              </Label>
              {csvPreview && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600 mb-1">Preview (first 5 rows):</p>
                  <pre className="text-xs bg-gray-50 p-3 rounded border overflow-x-auto">
                    {csvPreview}
                  </pre>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Processing Rules */}
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-sm">Processing Rules</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="required-fields" className="text-xs">Required Fields (comma-separated)</Label>
              <Input
                id="required-fields"
                placeholder="e.g., id,email"
                value={requiredFields}
                onChange={(e) => setRequiredFields(e.target.value)}
                className="text-sm"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="dedupe-fields" className="text-xs">Dedupe On Fields (comma-separated)</Label>
              <Input
                id="dedupe-fields"
                placeholder="e.g., email"
                value={dedupeFields}
                onChange={(e) => setDedupeFields(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="numeric-field" className="text-xs">Numeric Field for Statistics</Label>
            <Input
              id="numeric-field"
              placeholder="e.g., age, price, amount"
              value={numericField}
              onChange={(e) => setNumericField(e.target.value)}
              className="text-sm"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="drop-nulls" className="text-sm">Drop Null Values</Label>
            <Switch
              id="drop-nulls"
              checked={dropNulls}
              onCheckedChange={setDropNulls}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="strict-mode" className="text-sm">Strict Mode</Label>
            <Switch
              id="strict-mode"
              checked={strictMode}
              onCheckedChange={setStrictMode}
            />
          </div>
        </div>

        {/* Idempotency Key */}
        <div className="space-y-2">
          <Label htmlFor="idempotency-key">Idempotency Key (Optional)</Label>
          <div className="flex gap-2">
            <Input
              id="idempotency-key"
              placeholder="Enter or generate a UUID"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="font-mono text-sm"
            />
            <Button
              type="button"
              variant="outline"
              onClick={generateIdempotencyKey}
              className="whitespace-nowrap"
            >
              Generate UUID
            </Button>
            {idempotencyKey && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyIdempotencyKey}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full"
          size="lg"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Job'}
        </Button>
      </CardContent>
    </Card>
  );
}