import SignUpForm from "@/components/SignUpForm";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
        <h1 className="text-6xl font-black mb-4 text-gradient tracking-tight">
          SPORTS RATING
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Get your official performance card. Compare with teammates. Level up your game.
        </p>
      </div>
      <SignUpForm />
    </main>
  );
}
