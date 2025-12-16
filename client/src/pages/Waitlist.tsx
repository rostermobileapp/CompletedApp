import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import logoWhite from '@assets/Roster Logo White_1759233840726.png';
import { useState } from "react";

const waitlistFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  howHeard: z.string().optional(),
});

type WaitlistFormValues = z.infer<typeof waitlistFormSchema>;

const howHeardOptions = [
  { value: "friend", label: "Friend or teammate" },
  { value: "social", label: "Social media" },
  { value: "search", label: "Search engine" },
  { value: "league", label: "My league/team" },
  { value: "ad", label: "Online advertisement" },
  { value: "other", label: "Other" },
];

export default function Waitlist() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<WaitlistFormValues>({
    resolver: zodResolver(waitlistFormSchema),
    defaultValues: {
      firstName: "",
      email: "",
      phone: "",
      howHeard: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: WaitlistFormValues) => {
      return await apiRequest("/api/waitlist", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      setIsSubmitted(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to join waitlist. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: WaitlistFormValues) => {
    submitMutation.mutate(data);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col" data-testid="waitlist-success-page">
        <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-center items-center">
            <Link href="/">
              <img 
                src={logoWhite} 
                alt="Roster Logo" 
                className="h-8 cursor-pointer"
                data-testid="logo-image"
              />
            </Link>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center px-6 pt-24 pb-12">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 bg-[#3c82f4] rounded-full flex items-center justify-center mx-auto mb-8">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold mb-4" data-testid="text-success-title">
              You're on the list!
            </h1>
            <p className="text-gray-400 mb-8" data-testid="text-success-message">
              Thanks for your interest in Roster. We'll be in touch soon with updates and early access information.
            </p>
            <Button
              onClick={() => setLocation("/")}
              className="px-8 py-3 rounded-full bg-[#3c82f4] hover:bg-[#3c82f4]/90 text-white font-semibold"
              data-testid="button-back-home"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col" data-testid="waitlist-page">
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="text-white hover:bg-gray-800"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </Button>
          <Link href="/">
            <img 
              src={logoWhite} 
              alt="Roster Logo" 
              className="h-8 cursor-pointer"
              data-testid="logo-image"
            />
          </Link>
          <div className="w-24"></div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 pt-24 pb-12">
        <div className="max-w-md w-full">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold mb-4" data-testid="text-waitlist-title">
              Join the Waitlist
            </h1>
            <p className="text-gray-400" data-testid="text-waitlist-subtitle">
              Be the first to know when Roster launches. Get early access and exclusive updates.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">First Name *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter your first name"
                        className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 focus:border-[#3c82f4]"
                        data-testid="input-first-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Email *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="Enter your email"
                        className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 focus:border-[#3c82f4]"
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Phone (optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="tel"
                        placeholder="Enter your phone number"
                        className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 focus:border-[#3c82f4]"
                        data-testid="input-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="howHeard"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">How did you hear about Roster?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger 
                          className="bg-gray-900 border-gray-700 text-white focus:border-[#3c82f4]"
                          data-testid="select-how-heard"
                        >
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        {howHeardOptions.map((option) => (
                          <SelectItem 
                            key={option.value} 
                            value={option.value}
                            className="text-white hover:bg-gray-800"
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={submitMutation.isPending}
                className="w-full py-3 rounded-full bg-[#3c82f4] hover:bg-[#3c82f4]/90 text-white font-semibold text-lg"
                data-testid="button-submit-waitlist"
              >
                {submitMutation.isPending ? "Joining..." : "Join Waitlist"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
